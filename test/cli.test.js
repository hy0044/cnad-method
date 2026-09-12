import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
