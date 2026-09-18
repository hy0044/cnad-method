#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageMetadata {
  version: string
}

interface Manifest {
  version?: string
  files?: Record<string, string>
}

interface TemplateEntry {
  rel: string
  content: string
  hash: string
}

interface UpdateInspection {
  manifest: Manifest
  entries: TemplateEntry[]
  conflicts: string[]
  changes: string[]
}

type AgentsIntegrationState = 'complete' | 'missing'
type AgentsIntegrationResult = 'created' | 'unchanged' | 'appended'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function parsePackageMetadata(value: unknown): PackageMetadata {
  if (!isRecord(value) || typeof value.version !== 'string') {
    throw new Error('Invalid package metadata: `version` must be a string.')
  }
  return { version: value.version }
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = parsePackageMetadata(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')))
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
const integrationBlockAtEofBytes = integrationBlockBytes.subarray(0, -1)
const integrationStartBytes = Buffer.from('<!-- cnad:start -->')
const integrationEndBytes = Buffer.from('<!-- cnad:end -->')

function normalizeText(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

function hash(content: string): string {
  return createHash('sha256').update(normalizeText(content)).digest('hex')
}

function walkFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root).sort()) {
    const full = join(root, entry)
    if (statSync(full).isDirectory()) files.push(...walkFiles(full))
    else files.push(full)
  }
  return files
}

function templateEntries(): TemplateEntry[] {
  return walkFiles(templatesRoot).map((source) => {
    const rel = relative(templatesRoot, source).replaceAll('\\', '/')
    const content = readFileSync(source, 'utf8')
    return { rel, content, hash: hash(content) }
  })
}

function managedTarget(rel: string): string {
  return join(methodRoot, rel)
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

function lstatIfExists(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (isErrorWithCode(error, 'ENOENT')) return null
    throw error
  }
}

function assertSafeRepositoryPath(target: string): void {
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

function nearestExistingParent(target: string): string {
  let current = dirname(target)
  while (!existsSync(current)) current = dirname(current)
  return current
}

function normalizeAgentLineEndings(bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1')
}

function inspectAgentsIntegration(bytes: Buffer): AgentsIntegrationState {
  const normalized = normalizeAgentLineEndings(bytes)
  const hasBlock =
    normalized.indexOf(integrationBlockBytes) !== -1 ||
    normalized.subarray(-integrationBlockAtEofBytes.length).equals(integrationBlockAtEofBytes)
  const hasStart = normalized.indexOf(integrationStartBytes) !== -1
  const hasEnd = normalized.indexOf(integrationEndBytes) !== -1

  if (hasBlock) return 'complete'
  if (hasStart || hasEnd) {
    throw new Error('Refusing AGENTS.md because it contains an incomplete CNAD integration marker.')
  }
  return 'missing'
}

function validateAgentsIntegrationTarget(): void {
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

function validateProjectGuidanceTarget(): void {
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

function validateManifestInstallTarget(): void {
  assertSafeRepositoryPath(manifestPath)
  if (existsSync(manifestPath)) throw new Error('CNAD is already initialized in this repository.')
  const parent = nearestExistingParent(manifestPath)
  const parentInfo = lstatIfExists(parent)
  if (!parentInfo?.isDirectory()) {
    throw new Error(`Refusing manifest parent because it is not a directory: ${relative(cwd, parent)}`)
  }
  accessSync(parent, constants.W_OK)
}

function isValidManagedPath(managedPath: string): boolean {
  if (managedPath.includes('\\')) return false
  const parts = managedPath.split('/')
  return (
    parts.length > 1 && parts[0] === 'method' && parts.every((part) => part !== '' && part !== '.' && part !== '..')
  )
}

function validateManifest(value: unknown): Manifest {
  if (!isRecord(value)) throw new Error('Invalid CNAD manifest: expected an object.')

  const { version, files } = value
  if (version != null && typeof version !== 'string') {
    throw new Error('Invalid CNAD manifest: `version` must be a string.')
  }
  const validatedVersion = typeof version === 'string' ? version : undefined
  if (files == null) return validatedVersion === undefined ? {} : { version: validatedVersion }
  if (!isRecord(files)) {
    throw new Error('Invalid CNAD manifest: `files` must be an object.')
  }

  const validatedFiles: Record<string, string> = {}
  for (const [managedPath, fileHash] of Object.entries(files)) {
    if (!isValidManagedPath(managedPath)) {
      throw new Error(`Invalid CNAD manifest path: ${managedPath}`)
    }
    if (typeof fileHash !== 'string') {
      throw new Error(`Invalid CNAD manifest hash for path: ${managedPath}`)
    }
    validatedFiles[managedPath] = fileHash
  }

  return validatedVersion === undefined
    ? { files: validatedFiles }
    : { version: validatedVersion, files: validatedFiles }
}

function readManifest(): Manifest {
  assertSafeRepositoryPath(manifestPath)
  const info = lstatIfExists(manifestPath)
  if (!info) throw new Error('CNAD is not initialized in this repository. Run `cnad init` first.')
  if (!info.isFile()) throw new Error('Invalid CNAD manifest: `.cnad/version.json` must be a regular file.')
  if (info.nlink > 1) throw new Error('Invalid CNAD manifest: `.cnad/version.json` must not have multiple hard links.')
  return validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
}

function writeManifest(entries: TemplateEntry[]): void {
  assertSafeRepositoryPath(manifestPath)
  const files = Object.fromEntries(entries.map(({ rel, hash: fileHash }) => [`method/${rel}`, fileHash]))
  ensureParent(manifestPath)
  assertSafeRepositoryPath(manifestPath)
  writeFileSync(manifestPath, `${JSON.stringify({ version: packageVersion, files }, null, 2)}\n`)
}

function manifestMatchesEntries(manifest: Manifest, entries: TemplateEntry[]): boolean {
  const files = Object.fromEntries(entries.map(({ rel, hash: fileHash }) => [`method/${rel}`, fileHash]))
  return manifest.version === packageVersion && JSON.stringify(manifest.files ?? {}) === JSON.stringify(files)
}

function assertGitRepository(): void {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' })
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    throw new Error('CNAD update requires a Git repository.')
  }
}

function isRecoverableByGit(target: string): boolean {
  const path = relative(cwd, target).replaceAll('\\', '/')
  const tracked = spawnSync('git', ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', path], {
    cwd,
    stdio: 'ignore',
  })
  if (tracked.status !== 0) return false

  const unchanged = spawnSync('git', ['--literal-pathspecs', 'diff', '--quiet', '--', path], { cwd, stdio: 'ignore' })
  return unchanged.status === 0
}

function appendAgentsIntegration(): AgentsIntegrationResult {
  assertSafeRepositoryPath(agentsPath)
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# Repository instructions\n\n${integrationBlock}`)
    return 'created'
  }

  const existing = readFileSync(agentsPath)
  const state = inspectAgentsIntegration(existing)
  if (state === 'complete') return 'unchanged'

  const separator =
    existing.length > 0 && existing[existing.length - 1] === 0x0a ? Buffer.from('\n') : Buffer.from('\n\n')
  assertSafeRepositoryPath(agentsPath)
  appendFileSync(agentsPath, Buffer.concat([separator, integrationBlockBytes]))
  return 'appended'
}

function init(): void {
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
    writeFileSync(
      projectPath,
      '# Project-specific CNAD guidance\n\nAdd repository-specific constraints here. This file is project-owned and is not overwritten by `cnad update`.\n',
    )
  }

  writeManifest(entries)
  const agents = appendAgentsIntegration()

  console.log(`CNAD ${packageVersion} initialized.`)
  console.log(`Managed files: ${entries.length}`)
  console.log(`AGENTS.md: ${agents}`)
}

function inspectUpdate(): UpdateInspection {
  const manifest = readManifest()
  const entries = templateEntries()
  const conflicts: string[] = []
  const changes: string[] = []

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

function entriesRequiringWrite(manifest: Manifest, entries: TemplateEntry[]): TemplateEntry[] {
  return entries.filter((entry) => manifest.files?.[`method/${entry.rel}`] !== entry.hash)
}

function obsoleteManagedPaths(manifest: Manifest, entries: TemplateEntry[]): string[] {
  const nextPaths = new Set(entries.map(({ rel }) => `method/${rel}`))
  return Object.keys(manifest.files ?? {}).filter((managedPath) => !nextPaths.has(managedPath))
}

function preflightUpdateMutations(manifest: Manifest, entries: TemplateEntry[]): void {
  const existingTargets: string[] = []
  if (!manifestMatchesEntries(manifest, entries)) existingTargets.push(manifestPath)

  for (const managedPath of obsoleteManagedPaths(manifest, entries)) {
    const target = join(cnadRoot, managedPath)
    if (existsSync(target)) existingTargets.push(target)
  }

  for (const entry of entriesRequiringWrite(manifest, entries)) {
    const target = managedTarget(entry.rel)
    if (existsSync(target)) existingTargets.push(target)
  }

  const unrecoverable = existingTargets.filter((target) => !isRecoverableByGit(target))
  if (unrecoverable.length > 0) {
    const paths = unrecoverable.map((target) => relative(cwd, target).replaceAll('\\', '/'))
    throw new Error(
      `CNAD update requires existing managed files to be recoverable by Git.\nThe following files cannot be safely recovered:\n- ${paths.join('\n- ')}\nCommit or otherwise place the CNAD-managed files under Git before running update.`,
    )
  }

  assertSafeRepositoryPath(manifestPath)
  if (!manifestMatchesEntries(manifest, entries)) accessSync(manifestPath, constants.R_OK | constants.W_OK)

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
      if (!info.isFile())
        throw new Error(`Refusing managed target because it is not a regular file: ${relative(cwd, target)}`)
      accessSync(target, constants.W_OK)
    } else {
      accessSync(nearestExistingParent(target), constants.W_OK)
    }
  }
}

function checkUpdate(): void {
  assertGitRepository()
  const { manifest, entries, conflicts, changes } = inspectUpdate()
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

  if (conflicts.length > 0) {
    process.exitCode = 2
    return
  }

  preflightUpdateMutations(manifest, entries)
}

function update(): void {
  assertGitRepository()
  const { manifest, entries, conflicts } = inspectUpdate()
  if (conflicts.length > 0) {
    throw new Error(
      `Update blocked because repository files conflict with CNAD ownership:\n- ${conflicts.join('\n- ')}`,
    )
  }

  preflightUpdateMutations(manifest, entries)

  try {
    for (const managedPath of obsoleteManagedPaths(manifest, entries)) {
      const target = join(cnadRoot, managedPath)
      if (existsSync(target)) unlinkSync(target)
    }

    for (const entry of entriesRequiringWrite(manifest, entries)) {
      const target = managedTarget(entry.rel)
      ensureParent(target)
      assertSafeRepositoryPath(target)
      writeFileSync(target, entry.content)
    }

    if (!manifestMatchesEntries(manifest, entries)) writeManifest(entries)
  } catch (error) {
    throw new Error(
      `CNAD update failed after repository files may have been modified: ${errorMessage(error)}\nReview the working tree with \`git status\` and \`git diff\`, then restore CNAD-managed changes with Git if needed.`,
      { cause: error },
    )
  }

  console.log(`CNAD updated to ${packageVersion}.`)
  console.log('Project-owned files were not modified.')
}

function usage(): void {
  console.log(`CNAD ${packageVersion}\n\nUsage:\n  cnad init\n  cnad update --check\n  cnad update\n`)
}

function main(): void {
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
  console.error(`cnad: ${errorMessage(error)}`)
  process.exitCode = 1
}
