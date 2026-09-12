import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const cli = resolve('bin/cnad.js')

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'cnad-rollback-'))
}

function run(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
}

function normalizedHash(content) {
  return createHash('sha256').update(content.replace(/\r\n?/g, '\n')).digest('hex')
}

test('failed obsolete-file staging restores files moved earlier in the same update', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const methodDir = join(cwd, '.cnad', 'method')
  const firstPath = join(methodDir, 'obsolete-a.md')
  const secondPath = join(methodDir, 'obsolete-b.md')
  const firstContent = 'obsolete a\n'
  const secondContent = 'obsolete b\n'
  writeFileSync(firstPath, firstContent)
  writeFileSync(secondPath, secondContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/obsolete-a.md'] = normalizedHash(firstContent)
  manifest.files['method/obsolete-b.md'] = normalizedHash(secondContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const preloadPath = join(cwd, 'fail-second-rename.mjs')
  writeFileSync(
    preloadPath,
    `import fs from 'node:fs'\nimport { syncBuiltinESMExports } from 'node:module'\nconst originalRenameSync = fs.renameSync\nlet calls = 0\nfs.renameSync = (...args) => {\n  calls += 1\n  if (calls === 2) {\n    const error = new Error('simulated EPERM while staging obsolete file')\n    error.code = 'EPERM'\n    throw error\n  }\n  return originalRenameSync(...args)\n}\nsyncBuiltinESMExports()\n`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, cli, 'update'], {
    cwd,
    encoding: 'utf8',
  })

  assert.equal(update.status, 1)
  assert.match(update.stderr, /simulated EPERM/)
  assert.equal(existsSync(firstPath), true)
  assert.equal(existsSync(secondPath), true)
  assert.equal(readFileSync(firstPath, 'utf8'), firstContent)
  assert.equal(readFileSync(secondPath, 'utf8'), secondContent)
  assert.equal(readdirSync(methodDir).some((name) => name.includes('.cnad-update-backup-')), false)

  const unchangedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(unchangedManifest.files['method/obsolete-a.md'], normalizedHash(firstContent))
  assert.equal(unchangedManifest.files['method/obsolete-b.md'], normalizedHash(secondContent))
})

test('failed managed-file write rolls back the whole update transaction', () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const methodDir = join(cwd, '.cnad', 'method')
  const firstPath = join(methodDir, 'review.md')
  const secondPath = join(methodDir, 'workflow.md')
  const firstContent = '# Old review template\n'
  const secondContent = '# Old workflow template\n'
  writeFileSync(firstPath, firstContent)
  writeFileSync(secondPath, secondContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = '0.0.0'
  manifest.files['method/review.md'] = normalizedHash(firstContent)
  manifest.files['method/workflow.md'] = normalizedHash(secondContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)

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
      const error = new Error('simulated EIO on second managed-file write')
      error.code = 'EIO'
      throw error
    }
  }
  return originalWriteFileSync(path, ...args)
}
syncBuiltinESMExports()
`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, cli, 'update'], {
    cwd,
    encoding: 'utf8',
  })

  assert.equal(update.status, 1)
  assert.match(update.stderr, /simulated EIO/)
  assert.equal(readFileSync(firstPath, 'utf8'), firstContent)
  assert.equal(readFileSync(secondPath, 'utf8'), secondContent)
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)

  const check = run(cwd, 'update', '--check')
  assert.equal(check.status, 0, check.stderr)
  assert.doesNotMatch(check.stdout, /has local changes/)
  assert.equal(
    readdirSync(methodDir).some((name) => name.includes('.cnad-update-backup-')) ||
      readdirSync(join(cwd, '.cnad')).some((name) => name.includes('.cnad-update-backup-')),
    false,
  )
})
