import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const cli = resolve('bin/cnad.js')

function tempRepo() {
  const cwd = mkdtempSync(join(tmpdir(), 'cnad-update-'))
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd }).status, 0)
  return cwd
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

function commitAll(cwd, message = 'test fixture') {
  assert.equal(spawnSync('git', ['add', '--all'], { cwd }).status, 0)
  assert.equal(spawnSync('git', ['-c', 'user.name=CNAD Test', '-c', 'user.email=cnad@example.com', 'commit', '--quiet', '-m', message], { cwd }).status, 0)
}

function normalizedHash(content) {
  return createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
}

test('successful update writes changed files and manifest without touching owned boundaries', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const unchangedPath = join(cwd, '.cnad', 'method', 'review.md')
  const changedPath = join(cwd, '.cnad', 'method', 'workflow.md')
  const oldContent = '# Old workflow\n'
  writeFileSync(changedPath, oldContent)
  const projectPath = join(cwd, '.cnad', 'project.md')
  const projectContent = '# Repository-specific guidance\n'
  writeFileSync(projectPath, projectContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = '0.0.0'
  manifest.files['method/workflow.md'] = normalizedHash(oldContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  commitAll(cwd)

  const preloadPath = join(cwd, 'reject-unchanged-write.mjs')
  writeFileSync(
    preloadPath,
    `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const unchangedPath = ${JSON.stringify(unchangedPath)}
const originalWriteFileSync = fs.writeFileSync
fs.writeFileSync = (path, ...args) => {
  if (String(path) === unchangedPath) throw new Error('unchanged managed file was rewritten')
  return originalWriteFileSync(path, ...args)
}
syncBuiltinESMExports()
`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, cli, 'update'], { cwd, encoding: 'utf8' })
  assert.equal(update.status, 0, update.stderr)
  assert.notEqual(readFileSync(changedPath, 'utf8'), oldContent)
  assert.equal(readFileSync(projectPath, 'utf8'), projectContent)
  assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).version, '0.1.0')
})

test('mid-update write failure reports Git recovery guidance without success', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const firstPath = join(cwd, '.cnad', 'method', 'review.md')
  const secondPath = join(cwd, '.cnad', 'method', 'workflow.md')
  const firstContent = '# Old review template\n'
  const secondContent = '# Old workflow template\n'
  writeFileSync(firstPath, firstContent)
  writeFileSync(secondPath, secondContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/review.md'] = normalizedHash(firstContent)
  manifest.files['method/workflow.md'] = normalizedHash(secondContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  commitAll(cwd)

  const preloadPath = join(cwd, 'fail-second-managed-write.mjs')
  writeFileSync(
    preloadPath,
    `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const originalWriteFileSync = fs.writeFileSync
let managedWrites = 0
fs.writeFileSync = (path, ...args) => {
  if (String(path).includes('/.cnad/method/')) {
    managedWrites += 1
    if (managedWrites === 2) {
      const error = new Error('simulated managed-file write failure')
      error.code = 'EIO'
      throw error
    }
  }
  return originalWriteFileSync(path, ...args)
}
syncBuiltinESMExports()
`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, cli, 'update'], { cwd, encoding: 'utf8' })
  assert.equal(update.status, 1)
  assert.match(update.stderr, /CNAD update failed after repository files may have been modified/)
  assert.match(update.stderr, /git status/)
  assert.match(update.stderr, /git diff/)
  assert.doesNotMatch(update.stdout, /CNAD updated/)
})

test('update requires a Git repository before inspecting or modifying CNAD files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cnad-no-git-'))
  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /requires a Git repository/)
})

test('update rejects untracked managed files before mutation', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managedPath = join(cwd, '.cnad', 'method', 'workflow.md')
  const managedContent = '# Old workflow\n'
  writeFileSync(managedPath, managedContent)
  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/workflow.md'] = normalizedHash(managedContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /recoverable from Git/)
  assert.match(update.stderr, /\.cnad\/method\/workflow\.md/)
  assert.match(update.stderr, /\.cnad\/version\.json/)
  assert.equal(readFileSync(managedPath, 'utf8'), managedContent)
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)
})

test('update rejects ignored managed files before mutation', () => {
  const cwd = tempRepo()
  writeFileSync(join(cwd, '.gitignore'), '.cnad/\n')
  commitAll(cwd)
  assert.equal(run(cwd, 'init').status, 0)

  const managedPath = join(cwd, '.cnad', 'method', 'workflow.md')
  const managedContent = '# Old workflow\n'
  writeFileSync(managedPath, managedContent)
  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/workflow.md'] = normalizedHash(managedContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /recoverable from Git/)
  assert.equal(readFileSync(managedPath, 'utf8'), managedContent)
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)
})

test('one unrecoverable target blocks all update mutations', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managedPath = join(cwd, '.cnad', 'method', 'workflow.md')
  const managedContent = '# Old workflow\n'
  writeFileSync(managedPath, managedContent)
  const obsoletePath = join(cwd, '.cnad', 'method', 'obsolete.md')
  const obsoleteContent = 'obsolete managed file\n'
  writeFileSync(obsoletePath, obsoleteContent)
  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/workflow.md'] = normalizedHash(managedContent)
  manifest.files['method/obsolete.md'] = normalizedHash(obsoleteContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)
  assert.equal(spawnSync('git', ['add', '.cnad/version.json', '.cnad/method/workflow.md'], { cwd }).status, 0)
  assert.equal(spawnSync('git', ['-c', 'user.name=CNAD Test', '-c', 'user.email=cnad@example.com', 'commit', '--quiet', '-m', 'tracked targets'], { cwd }).status, 0)

  const update = run(cwd, 'update')
  assert.equal(update.status, 1)
  assert.match(update.stderr, /\.cnad\/method\/obsolete\.md/)
  assert.equal(readFileSync(managedPath, 'utf8'), managedContent)
  assert.equal(readFileSync(obsoletePath, 'utf8'), obsoleteContent)
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)
})
