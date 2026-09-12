import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const cli = resolve('bin/cnad.js')

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'cnad-'))
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

function normalizedHash(content) {
  return createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
}

test('init installs managed files without taking ownership of project guidance', () => {
  const cwd = tempRepo()
  writeFileSync(join(cwd, 'AGENTS.md'), '# Existing instructions\n')

  const result = run(cwd, 'init')
  assert.equal(result.status, 0, result.stderr)

  const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
  assert.match(agents, /# Existing instructions/)
  assert.match(agents, /<!-- cnad:start -->/)

  const project = readFileSync(join(cwd, '.cnad', 'project.md'), 'utf8')
  assert.match(project, /project-owned/)

  const manifest = JSON.parse(readFileSync(join(cwd, '.cnad', 'version.json'), 'utf8'))
  assert.equal(manifest.version, '0.1.0')
  assert.ok(manifest.files['method/review.md'])
})

test('init rejects unsupported options without mutating the repository', () => {
  for (const option of ['--help', '--dry-run']) {
    const cwd = tempRepo()
    const result = run(cwd, 'init', option)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Unknown command/)
    assert.equal(existsSync(join(cwd, '.cnad')), false)
    assert.equal(existsSync(join(cwd, 'AGENTS.md')), false)
  }
})

test('update --check reports a clean installation without modifying project files', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const projectPath = join(cwd, '.cnad', 'project.md')
  writeFileSync(projectPath, '# My project rules\n')

  const result = run(cwd, 'update', '--check')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /No CNAD-managed file changes detected/)
  assert.equal(readFileSync(projectPath, 'utf8'), '# My project rules\n')
})

test('local edits to CNAD-managed files block updates', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  writeFileSync(managed, `${readFileSync(managed, 'utf8')}\nlocal edit\n`)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 2)
  assert.match(check.stdout, /has local changes/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /Update blocked/)
  assert.match(readFileSync(managed, 'utf8'), /local edit/)
})

test('CRLF checkout does not count as a local managed-file edit', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  const lfContent = readFileSync(managed, 'utf8')
  writeFileSync(managed, lfContent.replace(/\n/g, '\r\n'))

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stdout, /No CNAD-managed file changes detected/)
})

test('manifest traversal paths are rejected before project-owned files can be touched', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const protectedPath = join(cwd, 'project-owned.txt')
  const protectedContent = 'keep me\n'
  writeFileSync(protectedPath, protectedContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['../project-owned.txt'] = normalizedHash(protectedContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 1)
  assert.match(check.stderr, /Invalid CNAD manifest path/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /Invalid CNAD manifest path/)
  assert.equal(readFileSync(protectedPath, 'utf8'), protectedContent)
})

test('non-regular manifests are rejected before they can block reads', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  unlinkSync(manifestPath)
  mkdirSync(manifestPath)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 1)
  assert.match(check.stderr, /Invalid CNAD manifest.*regular file/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /Invalid CNAD manifest.*regular file/)
})

test('symlinked managed files are rejected before their targets can be overwritten', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  const originalContent = readFileSync(managed, 'utf8')
  const externalDir = tempRepo()
  const externalPath = join(externalDir, 'protected.md')
  writeFileSync(externalPath, originalContent)
  unlinkSync(managed)
  symlinkSync(externalPath, managed)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 1)
  assert.match(check.stderr, /Refusing symlinked repository path/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /Refusing symlinked repository path/)
  assert.equal(readFileSync(externalPath, 'utf8'), originalContent)
})

test('hard-linked managed files are rejected before their peers can be overwritten', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  const originalContent = readFileSync(managed, 'utf8')
  const peerPath = join(cwd, 'project-owned.md')
  writeFileSync(peerPath, originalContent)
  unlinkSync(managed)
  linkSync(peerPath, managed)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 1)
  assert.match(check.stderr, /Refusing hard-linked repository file/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /Refusing hard-linked repository file/)
  assert.equal(readFileSync(peerPath, 'utf8'), originalContent)
})

test('symlinked AGENTS.md is rejected before init can modify its target', () => {
  const cwd = tempRepo()
  const externalDir = tempRepo()
  const externalPath = join(externalDir, 'AGENTS.md')
  const originalContent = '# External instructions\n'
  writeFileSync(externalPath, originalContent)
  symlinkSync(externalPath, join(cwd, 'AGENTS.md'))

  const result = run(cwd, 'init')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Refusing symlinked repository path/)
  assert.equal(readFileSync(externalPath, 'utf8'), originalContent)
})

test('invalid AGENTS.md is rejected before init mutates the repository', () => {
  const cwd = tempRepo()
  mkdirSync(join(cwd, 'AGENTS.md'))

  const result = run(cwd, 'init')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /AGENTS\.md because it is not a regular file/)
  assert.equal(existsSync(join(cwd, '.cnad')), false)
})

test('incomplete CNAD integration markers are rejected before init mutates the repository', () => {
  const cwd = tempRepo()
  writeFileSync(join(cwd, 'AGENTS.md'), '# Existing instructions\n\n<!-- cnad:start -->\n')

  const result = run(cwd, 'init')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /incomplete CNAD integration marker/)
  assert.equal(existsSync(join(cwd, '.cnad')), false)
})

test('appending CNAD integration preserves existing AGENTS.md bytes', () => {
  const cwd = tempRepo()
  const agentsPath = join(cwd, 'AGENTS.md')
  const original = Buffer.from([0xff, 0xfe, 0x41, 0x0a])
  writeFileSync(agentsPath, original)

  const result = run(cwd, 'init')
  assert.equal(result.status, 0, result.stderr)

  const updated = readFileSync(agentsPath)
  assert.deepEqual(updated.subarray(0, original.length), original)
  assert.notEqual(updated.indexOf(Buffer.from('<!-- cnad:start -->')), -1)
})

test('invalid project guidance is rejected before init mutates managed files', () => {
  const cwd = tempRepo()
  mkdirSync(join(cwd, '.cnad'), { recursive: true })
  mkdirSync(join(cwd, '.cnad', 'project.md'))

  const result = run(cwd, 'init')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /\.cnad\/project\.md because it is not a regular file/)
  assert.equal(existsSync(join(cwd, '.cnad', 'version.json')), false)
  assert.equal(existsSync(join(cwd, '.cnad', 'method')), false)
})

test('missing project guidance parent is preflighted before init mutations', { skip: process.getuid?.() === 0 }, () => {
  const cwd = tempRepo()
  const cnad = join(cwd, '.cnad')
  const method = join(cnad, 'method')
  mkdirSync(method, { recursive: true })
  chmodSync(cnad, 0o555)
  try {
    const result = run(cwd, 'init')
    assert.equal(result.status, 1)
    assert.equal(existsSync(join(cnad, 'project.md')), false)
    assert.equal(existsSync(join(cnad, 'version.json')), false)
    assert.equal(existsSync(join(cwd, 'AGENTS.md')), false)
  } finally {
    chmodSync(cnad, 0o755)
  }
})

test('manifest parent is preflighted before init writes managed templates', { skip: process.getuid?.() === 0 }, () => {
  const cwd = tempRepo()
  const cnad = join(cwd, '.cnad')
  const method = join(cnad, 'method')
  mkdirSync(method, { recursive: true })
  writeFileSync(join(cnad, 'project.md'), '# Existing project guidance\n')
  chmodSync(cnad, 0o555)
  try {
    const result = run(cwd, 'init')
    assert.equal(result.status, 1)
    assert.equal(existsSync(join(cnad, 'version.json')), false)
    assert.equal(existsSync(join(method, 'review.md')), false)
    assert.equal(existsSync(join(cwd, 'AGENTS.md')), false)
  } finally {
    chmodSync(cnad, 0o755)
  }
})

test('non-regular managed targets are rejected before they can block or be read', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  unlinkSync(managed)
  mkdirSync(managed)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 2)
  assert.match(check.stdout, /method\/review\.md is not a regular file/)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /method\/review\.md is not a regular file/)
})

test('update failure before mutation leaves obsolete managed files untouched', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const obsoletePath = join(cwd, '.cnad', 'method', 'obsolete.md')
  const obsoleteContent = 'obsolete\n'
  writeFileSync(obsoletePath, obsoleteContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/obsolete.md'] = normalizedHash(obsoleteContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const managed = join(cwd, '.cnad', 'method', 'review.md')
  unlinkSync(managed)
  mkdirSync(managed)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.equal(existsSync(obsoletePath), true)
  assert.equal(readFileSync(obsoletePath, 'utf8'), obsoleteContent)
})
