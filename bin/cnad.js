#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { accessSync, appendFileSync, chmodSync, chownSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const packageVersion = packageJson.version
const templatesRoot = join(packageRoot, 'templates', 'method')
const cwd = process.cwd()
const cnadRoot = join(cwd, '.cnad')
const methodRoot = join(cnadRoot, 'method')
const manifestPath = join(cnadRoot, 'version.json')
const projectPath = join(cnadRoot, 'project.md')
const agentsPath = join(cwd, 'AGENTS.md')

const integrationBlock = `<!-- cnad:start -->\n## CNAD\n\nFollow the CNAD method in \`.cnad/method/\`.\nProject-specific CNAD guidance belongs in \`.cnad/project.md\`.\n<!-- cnad:end -->\n`
const integrationBlockBytes = Buffer.from(integrationBlock)
const integrationStartBytes = Buffer.from('<!-- cnad:start -->')
const integrationEndBytes = Buffer.from('<!-- cnad:end -->')

function normalizeText(content) {
  return content.replace(/\r\n?/g, '\n')
}

function hash(content) {
  return createHash('sha256').update(normalizeText(content)).digest('hex')
}

function walkFiles(root) {
  const files = []
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry)
    if (statSync(full).isDirectory()) files.push(...walkFiles(full))
    else files.push(full)
  }
  return files
}

function templateEntries() {
  return walkFiles(templatesRoot).map((source) => {
    const rel = relative(templatesRoot, source).replaceAll('\\', '/')
    const content = readFileSync(source, 'utf8')
    return { rel, content, hash: hash(content) }
  })
}

function managedTarget(rel) {
  return join(methodRoot, rel)
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true })
}

function lstatIfExists(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function assertSafeRepositoryPath(target) {
  const rel = relative(cwd, target)
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`Refusing path outside repository: ${target}`)
  }

  let current = cwd
  const parts = rel.split(sep)
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    const info = lstatIfExists(current)
    if (!info) break
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing symlinked repository path: ${relative(cwd, current)}`)
    }
    if (index === parts.length - 1 && info.isFile() && info.nlink > 1) {
      throw new Error(`Refusing hard-linked repository file: ${relative(cwd, current)}`)
    }
  }
}

function nearestExistingParent(target) {
  let current = dirname(target)
  while (!existsSync(current)) current = dirname(current)
  return current
}

function normalizeAgentLineEndings(bytes) {
  return Buffer.from(bytes.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1')
}

function inspectAgentsIntegration(bytes) {
  const normalized = normalizeAgentLineEndings(bytes)
  const hasBlock = normalized.indexOf(integrationBlockBytes) !== -1
  const hasStart = normalized.indexOf(integrationStartBytes) !== -1
  const hasEnd = normalized.indexOf(integrationEndBytes) !== -1

  if (hasBlock) return 'complete'
  if (hasStart || hasEnd) {
    throw new Error('Refusing AGENTS.md because it contains an incomplete CNAD integration marker.')
  }
  return 'missing'
}

function validateAgentsIntegrationTarget() {
  assertSafeRepositoryPath(agentsPath)
  const info = lstatIfExists(agentsPath)
  if (!info) {
    accessSync(cwd, constants.W_OK)
    return
  }
  if (!info.isFile()) {
    throw new Error('Refusing AGENTS.md because it is not a regular file.')
  }

  accessSync(agentsPath, constants.R_OK)
  const state = inspectAgentsIntegration(readFileSync(agentsPath))
  if (state === 'missing') accessSync(agentsPath, constants.W_OK)
}

function validateProjectGuidanceTarget() {
  assertSafeRepositoryPath(projectPath)
  const info = lstatIfExists(projectPath)
  if (!info) {
    const parent = nearestExistingParent(projectPath)
    const parentInfo = lstatIfExists(parent)
    if (!parentInfo?.isDirectory()) {
      throw new Error(`Refusing project guidance parent because it is not a directory: ${relative(cwd, parent)}`)
    }
    accessSync(parent, constants.W_OK)
    return
  }
  if (!info.isFile()) {
    throw new Error('Refusing .cnad/project.md because it is not a regular file.')
  }
  accessSync(projectPath, constants.R_OK)
}

function validateManifestInstallTarget() {
  assertSafeRepositoryPath(manifestPath)
  if (existsSync(manifestPath)) throw new Error('CNAD is already initialized in this repository.')
  const parent = nearestExistingParent(manifestPath)
  const parentInfo = lstatIfExists(parent)
  if (!parentInfo?.isDirectory()) {
    throw new Error(`Refusing manifest parent because it is not a directory: ${relative(cwd, parent)}`)
  }
  accessSync(parent, constants.W_OK)
}

function isValidManagedPath(managedPath) {
  if (typeof managedPath !== 'string' || managedPath.includes('\\')) return false
  const parts = managedPath.split('/')
  return parts.length > 1 && parts[0] === 'method' && parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

function validateManifest(manifest) {
  if (manifest.files == null) return manifest
  if (typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Invalid CNAD manifest: `files` must be an object.')
  }

  for (const managedPath of Object.keys(manifest.files)) {
    if (!isValidManagedPath(managedPath)) {
      throw new Error(`Invalid CNAD manifest path: ${managedPath}`)
    }
  }

  return manifest
}

function readManifest() {
  assertSafeRepositoryPath(manifestPath)
  const info = lstatIfExists(manifestPath)
  if (!info) throw new Error('CNAD is not initialized in this repository. Run `cnad init` first.')
  if (!info.isFile()) throw new Error('Invalid CNAD manifest: `.cnad/version.json` must be a regular file.')
  if (info.nlink > 1) throw new Error('Invalid CNAD manifest: `.cnad/version.json` must not have multiple hard links.')
  return validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
}

function writeManifest(entries) {
  assertSafeRepositoryPath(manifestPath)
  const files = Object.fromEntries(entries.map(({ rel, hash: fileHash }) => [`method/${rel}`, fileHash]))
  ensureParent(manifestPath)
  assertSafeRepositoryPath(manifestPath)
  writeFileSync(manifestPath, `${JSON.stringify({ version: packageVersion, files }, null, 2)}\n`)
}

function appendAgentsIntegration() {
  assertSafeRepositoryPath(agentsPath)
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# Repository instructions\n\n${integrationBlock}`)
    return 'created'
  }

  const existing = readFileSync(agentsPath)
  const state = inspectAgentsIntegration(existing)
  if (state === 'complete') return 'unchanged'

  const separator = existing.length > 0 && existing[existing.length - 1] === 0x0a ? Buffer.from('\n') : Buffer.from('\n\n')
  assertSafeRepositoryPath(agentsPath)
  appendFileSync(agentsPath, Buffer.concat([separator, integrationBlockBytes]))
  return 'appended'
}

function init() {
  validateManifestInstallTarget()
  validateProjectGuidanceTarget()
  validateAgentsIntegrationTarget()

  const entries = templateEntries()
  for (const entry of entries) assertSafeRepositoryPath(managedTarget(entry.rel))

  const collisions = entries
    .map((entry) => managedTarget(entry.rel))
    .filter((target) => existsSync(target))
    .map((target) => relative(cwd, target))

  if (collisions.length > 0) {
    throw new Error(`Refusing to overwrite existing files:\n- ${collisions.join('\n- ')}`)
  }

  mkdirSync(methodRoot, { recursive: true })
  for (const entry of entries) {
    const target = managedTarget(entry.rel)
    ensureParent(target)
    assertSafeRepositoryPath(target)
    writeFileSync(target, entry.content)
  }

  if (!existsSync(projectPath)) {
    assertSafeRepositoryPath(projectPath)
    writeFileSync(projectPath, '# Project-specific CNAD guidance\n\nAdd repository-specific constraints here. This file is project-owned and is not overwritten by `cnad update`.\n')
  }

  writeManifest(entries)
  const agents = appendAgentsIntegration()

  console.log(`CNAD ${packageVersion} initialized.`)
  console.log(`Managed files: ${entries.length}`)
  console.log(`AGENTS.md: ${agents}`)
}

function inspectUpdate() {
  const manifest = readManifest()
  const entries = templateEntries()
  const conflicts = []
  const changes = []

  for (const [managedPath, recordedHash] of Object.entries(manifest.files ?? {})) {
    const target = join(cnadRoot, managedPath)
    assertSafeRepositoryPath(target)
    const info = lstatIfExists(target)
    if (!info) {
      conflicts.push(`${managedPath} is missing`)
      continue
    }
    if (!info.isFile()) {
      conflicts.push(`${managedPath} is not a regular file`)
      continue
    }
    if (info.nlink > 1) {
      conflicts.push(`${managedPath} has multiple hard links`)
      continue
    }
    if (hash(readFileSync(target, 'utf8')) !== recordedHash) conflicts.push(`${managedPath} has local changes`)
  }

  const nextPaths = new Set(entries.map(({ rel }) => `method/${rel}`))
  for (const managedPath of Object.keys(manifest.files ?? {})) {
    if (!nextPaths.has(managedPath)) changes.push(`${managedPath} will be removed`)
  }

  for (const entry of entries) {
    const managedPath = `method/${entry.rel}`
    const previousHash = manifest.files?.[managedPath]
    const target = join(cnadRoot, managedPath)
    assertSafeRepositoryPath(target)

    if (!previousHash) {
      if (existsSync(target)) conflicts.push(`${managedPath} exists but is not CNAD-owned`)
      changes.push(`${managedPath} will be added`)
    } else if (previousHash !== entry.hash) {
      changes.push(`${managedPath} will be updated`)
    }
  }

  return { manifest, entries, conflicts, changes }
}

function entriesRequiringWrite(manifest, entries) {
  return entries.filter((entry) => manifest.files?.[`method/${entry.rel}`] !== entry.hash)
}

function obsoleteManagedPaths(manifest, entries) {
  const nextPaths = new Set(entries.map(({ rel }) => `method/${rel}`))
  return Object.keys(manifest.files ?? {}).filter((managedPath) => !nextPaths.has(managedPath))
}

function preflightUpdateMutations(manifest, entries) {
  assertSafeRepositoryPath(manifestPath)
  accessSync(manifestPath, constants.R_OK | constants.W_OK)
  accessSync(dirname(manifestPath), constants.W_OK)

  for (const managedPath of obsoleteManagedPaths(manifest, entries)) {
    const target = join(cnadRoot, managedPath)
    assertSafeRepositoryPath(target)
    accessSync(dirname(target), constants.W_OK)
  }

  for (const entry of entriesRequiringWrite(manifest, entries)) {
    const target = managedTarget(entry.rel)
    assertSafeRepositoryPath(target)
    const info = lstatIfExists(target)
    if (info) {
      if (!info.isFile()) throw new Error(`Refusing managed target because it is not a regular file: ${relative(cwd, target)}`)
      accessSync(target, constants.W_OK)
      accessSync(dirname(target), constants.W_OK)
    } else {
      accessSync(nearestExistingParent(target), constants.W_OK)
    }
  }
}

function backupPathFor(target, index) {
  let attempt = 0
  while (true) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const backup = `${target}.cnad-update-backup-${process.pid}-${index}${suffix}`
    assertSafeRepositoryPath(backup)
    if (!existsSync(backup)) return backup
    attempt += 1
  }
}

function rollbackMutations(staged) {
  const rollbackErrors = []

  for (const { target, writeAttempted } of [...staged].reverse()) {
    if (!writeAttempted) continue
    try {
      if (existsSync(target)) unlinkSync(target)
    } catch (error) {
      rollbackErrors.push(error)
    }
  }

  for (const { createdParents = [] } of [...staged].reverse()) {
    for (const parent of createdParents) {
      try {
        if (existsSync(parent)) rmdirSync(parent)
      } catch (error) {
        rollbackErrors.push(error)
      }
    }
  }

  for (const { target, backup } of [...staged].reverse()) {
    if (!backup) continue
    try {
      if (existsSync(backup) && !existsSync(target)) renameSync(backup, target)
    } catch (error) {
      rollbackErrors.push(error)
    }
  }

  if (rollbackErrors.length > 0) {
    throw new Error(`Failed to roll back CNAD update: ${rollbackErrors.map((error) => error.message).join('; ')}`)
  }
}

function stageMutation(staged, target) {
  assertSafeRepositoryPath(target)
  const info = lstatIfExists(target)
  const backup = info ? backupPathFor(target, staged.length) : null
  if (backup) renameSync(target, backup)
  const mutation = { target, backup, mode: info?.mode, uid: info?.uid, gid: info?.gid, createdParents: [], writeAttempted: false }
  staged.push(mutation)
  return mutation
}

function writeStagedMutation(mutation, content) {
  let parent = dirname(mutation.target)
  while (!existsSync(parent)) {
    mutation.createdParents.push(parent)
    parent = dirname(parent)
  }
  ensureParent(mutation.target)
  assertSafeRepositoryPath(mutation.target)
  mutation.writeAttempted = true
  writeFileSync(mutation.target, content)
  if (mutation.mode !== undefined) {
    if (process.platform !== 'win32') {
      const current = lstatSync(mutation.target)
      if (current.uid !== mutation.uid || current.gid !== mutation.gid) {
        const effectiveUid = process.geteuid?.()
        const sharedWrite = effectiveUid !== undefined && effectiveUid !== 0 &&
          current.uid === effectiveUid && current.gid === mutation.gid &&
          (mutation.mode & 0o020) !== 0
        if (!sharedWrite) chownSync(mutation.target, mutation.uid, mutation.gid)
      }
    }
    chmodSync(mutation.target, mutation.mode)
  }
}

function throwWithRollback(error, staged) {
  try {
    rollbackMutations(staged)
  } catch (rollbackError) {
    throw new Error(`${error.message}; ${rollbackError.message}`, { cause: error })
  }
  throw error
}

function discardBackups(staged) {
  for (const { backup } of staged) {
    if (backup && existsSync(backup)) unlinkSync(backup)
  }
}

function checkUpdate() {
  const { manifest, conflicts, changes } = inspectUpdate()
  console.log(`Installed: ${manifest.version ?? 'unknown'}`)
  console.log(`Target:    ${packageVersion}`)

  if (conflicts.length > 0) {
    console.log('\nConflicts:')
    for (const conflict of conflicts) console.log(`- ${conflict}`)
  }

  if (changes.length > 0) {
    console.log('\nChanges:')
    for (const change of changes) console.log(`- ${change}`)
  } else {
    console.log('\nNo CNAD-managed file changes detected.')
  }

  if (conflicts.length > 0) process.exitCode = 2
}

function update() {
  const { manifest, entries, conflicts } = inspectUpdate()
  if (conflicts.length > 0) {
    throw new Error(`Update blocked because repository files conflict with CNAD ownership:\n- ${conflicts.join('\n- ')}`)
  }

  preflightUpdateMutations(manifest, entries)
  const staged = []

  try {
    for (const managedPath of obsoleteManagedPaths(manifest, entries)) {
      const target = join(cnadRoot, managedPath)
      if (existsSync(target)) stageMutation(staged, target)
    }

    for (const entry of entriesRequiringWrite(manifest, entries)) {
      const target = managedTarget(entry.rel)
      const mutation = stageMutation(staged, target)
      writeStagedMutation(mutation, entry.content)
    }

    const manifestMutation = stageMutation(staged, manifestPath)
    const files = Object.fromEntries(entries.map(({ rel, hash: fileHash }) => [`method/${rel}`, fileHash]))
    writeStagedMutation(manifestMutation, `${JSON.stringify({ version: packageVersion, files }, null, 2)}\n`)
  } catch (error) {
    throwWithRollback(error, staged)
  }

  discardBackups(staged)
  console.log(`CNAD updated to ${packageVersion}.`)
  console.log('Project-owned files were not modified.')
}

function usage() {
  console.log(`CNAD ${packageVersion}\n\nUsage:\n  cnad init\n  cnad update --check\n  cnad update\n`)
}

function main() {
  const [, , command, ...args] = process.argv

  if (!command || command === '--help' || command === '-h') return usage()
  if ((command === '--version' || command === '-v') && args.length === 0) return console.log(packageVersion)
  if (command === 'init' && args.length === 0) return init()
  if (command === 'update' && args.length === 1 && args[0] === '--check') return checkUpdate()
  if (command === 'update' && args.length === 0) return update()

  throw new Error(`Unknown command: ${[command, ...args].filter(Boolean).join(' ')}`)
}

try {
  main()
} catch (error) {
  console.error(`cnad: ${error.message}`)
  process.exitCode = 1
}
