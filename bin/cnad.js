#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
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

function hash(content) {
  return createHash('sha256').update(content).digest('hex')
}

function walkFiles(root) {
  const files = []
  for (const entry of readdirSync(root)) {
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

function readManifest() {
  if (!existsSync(manifestPath)) throw new Error('CNAD is not initialized in this repository. Run `cnad init` first.')
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function writeManifest(entries) {
  const files = Object.fromEntries(entries.map(({ rel, hash: fileHash }) => [`method/${rel}`, fileHash]))
  ensureParent(manifestPath)
  writeFileSync(manifestPath, `${JSON.stringify({ version: packageVersion, files }, null, 2)}\n`)
}

function appendAgentsIntegration() {
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, `# Repository instructions\n\n${integrationBlock}`)
    return 'created'
  }

  const existing = readFileSync(agentsPath, 'utf8')
  if (existing.includes('<!-- cnad:start -->')) return 'unchanged'

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  writeFileSync(agentsPath, `${existing}${separator}${integrationBlock}`)
  return 'appended'
}

function init() {
  if (existsSync(manifestPath)) throw new Error('CNAD is already initialized in this repository.')

  const entries = templateEntries()
  mkdirSync(methodRoot, { recursive: true })

  for (const entry of entries) {
    const target = managedTarget(entry.rel)
    ensureParent(target)
    if (existsSync(target)) throw new Error(`Refusing to overwrite existing file: ${relative(cwd, target)}`)
    writeFileSync(target, entry.content)
  }

  if (!existsSync(projectPath)) {
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
    if (!existsSync(target)) {
      conflicts.push(`${managedPath} is missing`)
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
    if (!previousHash) changes.push(`${managedPath} will be added`)
    else if (previousHash !== entry.hash) changes.push(`${managedPath} will be updated`)
  }

  return { manifest, entries, conflicts, changes }
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
    throw new Error(`Update blocked because CNAD-managed files were changed locally:\n- ${conflicts.join('\n- ')}`)
  }

  const nextPaths = new Set(entries.map(({ rel }) => `method/${rel}`))
  for (const managedPath of Object.keys(manifest.files ?? {})) {
    if (!nextPaths.has(managedPath)) {
      const target = join(cnadRoot, managedPath)
      if (existsSync(target)) unlinkSync(target)
    }
  }

  for (const entry of entries) {
    const target = managedTarget(entry.rel)
    ensureParent(target)
    writeFileSync(target, entry.content)
  }

  writeManifest(entries)
  console.log(`CNAD updated to ${packageVersion}.`)
  console.log('Project-owned files were not modified.')
}

function usage() {
  console.log(`CNAD ${packageVersion}\n\nUsage:\n  cnad init\n  cnad update --check\n  cnad update\n`)
}

function main() {
  const [, , command, option] = process.argv

  if (!command || command === '--help' || command === '-h') return usage()
  if (command === '--version' || command === '-v') return console.log(packageVersion)
  if (command === 'init') return init()
  if (command === 'update' && option === '--check') return checkUpdate()
  if (command === 'update' && !option) return update()

  throw new Error(`Unknown command: ${[command, option].filter(Boolean).join(' ')}`)
}

try {
  main()
} catch (error) {
  console.error(`cnad: ${error.message}`)
  process.exitCode = 1
}
