import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
  assert.equal(
    readdirSync(methodDir).some((name) => name.includes('.cnad-update-backup-')) ||
      readdirSync(join(cwd, '.cnad')).some((name) => name.includes('.cnad-update-backup-')),
    false,
  )

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

test('rollback removes transaction-created parents before restoring an obsolete file', () => {
  const packageRoot = tempRepo()
  cpSync(resolve('bin'), join(packageRoot, 'bin'), { recursive: true })
  cpSync(resolve('templates'), join(packageRoot, 'templates'), { recursive: true })
  cpSync(resolve('package.json'), join(packageRoot, 'package.json'))
  const fixtureCli = join(packageRoot, 'bin', 'cnad.js')

  const cwd = tempRepo()
  assert.equal(spawnSync(process.execPath, [fixtureCli, 'init'], { cwd }).status, 0)

  const methodDir = join(cwd, '.cnad', 'method')
  const oldPath = join(methodDir, 'foo')
  const oldContent = 'old managed file\n'
  writeFileSync(oldPath, oldContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/foo'] = normalizedHash(oldContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)

  const nestedTemplateDir = join(packageRoot, 'templates', 'method', 'foo')
  mkdirSync(nestedTemplateDir)
  writeFileSync(join(nestedTemplateDir, 'bar.md'), 'new nested managed file\n')

  const preloadPath = join(cwd, 'fail-manifest-write.mjs')
  writeFileSync(
    preloadPath,
    `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const originalWriteFileSync = fs.writeFileSync
fs.writeFileSync = (path, ...args) => {
  if (String(path).endsWith('/.cnad/version.json')) {
    const error = new Error('simulated manifest write failure')
    error.code = 'EIO'
    throw error
  }
  return originalWriteFileSync(path, ...args)
}
syncBuiltinESMExports()
`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, fixtureCli, 'update'], { cwd, encoding: 'utf8' })
  assert.equal(update.status, 1)
  assert.match(update.stderr, /simulated manifest write failure/)
  assert.equal(statSync(oldPath).isFile(), true)
  assert.equal(readFileSync(oldPath, 'utf8'), oldContent)
  assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)
  assert.equal(
    readdirSync(methodDir).some((name) => name.includes('.cnad-update-backup-')) ||
      readdirSync(join(cwd, '.cnad')).some((name) => name.includes('.cnad-update-backup-')),
    false,
  )

  const check = spawnSync(process.execPath, [fixtureCli, 'update', '--check'], { cwd, encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  assert.doesNotMatch(check.stdout, /has local changes/)
})

test('group-writable updates tolerate an unprivileged ownership restore', {
  skip: process.platform === 'win32',
}, () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managedPath = join(cwd, '.cnad', 'method', 'review.md')
  const managedContent = '# Old review template\n'
  writeFileSync(managedPath, managedContent)
  chmodSync(managedPath, 0o660)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.files['method/review.md'] = normalizedHash(managedContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const preloadPath = join(cwd, 'shared-owner.mjs')
  writeFileSync(
    preloadPath,
    `import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
const managedPath = ${JSON.stringify(managedPath)}
const originalLstatSync = fs.lstatSync
const originalRenameSync = fs.renameSync
const originalChownSync = fs.chownSync
let staged = false
process.geteuid = () => 1000
fs.lstatSync = (path, ...args) => {
  const info = originalLstatSync(path, ...args)
  if (String(path) !== managedPath) return info
  return new Proxy(info, { get: (target, property) => property === 'uid' ? (staged ? 1000 : 1001) : Reflect.get(target, property, target) })
}
fs.renameSync = (from, ...args) => {
  const result = originalRenameSync(from, ...args)
  if (String(from) === managedPath) staged = true
  return result
}
fs.chownSync = (path, ...args) => {
  if (String(path) === managedPath) {
    throw new Error('unexpected chown for shared checkout')
  }
  return originalChownSync(path, ...args)
}
syncBuiltinESMExports()
`,
  )

  const update = spawnSync(process.execPath, ['--import', preloadPath, cli, 'update'], { cwd, encoding: 'utf8' })
  assert.equal(update.status, 0, update.stderr)
  assert.notEqual(readFileSync(managedPath, 'utf8'), managedContent)
  assert.equal(statSync(managedPath).mode & 0o777, 0o660)
  assert.equal(readdirSync(join(cwd, '.cnad', 'method')).some((name) => name.includes('.cnad-update-backup-')), false)
})

test('update preflights an existing managed file parent before mutation', {
  skip: process.platform === 'win32' || process.getuid?.() === 0,
}, () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const methodDir = join(cwd, '.cnad', 'method')
  const managedPath = join(methodDir, 'review.md')
  const managedContent = '# Old review template\n'
  writeFileSync(managedPath, managedContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = '0.0.0'
  manifest.files['method/review.md'] = normalizedHash(managedContent)
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
  writeFileSync(manifestPath, manifestContent)

  chmodSync(methodDir, 0o555)
  try {
    const update = run(cwd, 'update')
    assert.equal(update.status, 1)
    assert.equal(readFileSync(managedPath, 'utf8'), managedContent)
    assert.equal(readFileSync(manifestPath, 'utf8'), manifestContent)
    assert.equal(readdirSync(methodDir).some((name) => name.includes('.cnad-update-backup-')), false)
    assert.equal(readdirSync(join(cwd, '.cnad')).some((name) => name.includes('.cnad-update-backup-')), false)
  } finally {
    chmodSync(methodDir, 0o755)
  }
})

test('successful update preserves modes of existing managed files and manifest', {
  skip: process.platform === 'win32',
}, () => {
  const cwd = tempRepo()
  assert.equal(run(cwd, 'init').status, 0)

  const managedPath = join(cwd, '.cnad', 'method', 'review.md')
  const managedContent = '# Old review template\n'
  writeFileSync(managedPath, managedContent)

  const manifestPath = join(cwd, '.cnad', 'version.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.version = '0.0.0'
  manifest.files['method/review.md'] = normalizedHash(managedContent)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  chmodSync(managedPath, 0o600)
  chmodSync(manifestPath, 0o640)
  const managedOwnership = statSync(managedPath)
  const manifestOwnership = statSync(manifestPath)

  const update = run(cwd, 'update')
  assert.equal(update.status, 0, update.stderr)
  assert.equal(statSync(managedPath).mode & 0o777, 0o600)
  assert.equal(statSync(manifestPath).mode & 0o777, 0o640)
  assert.equal(statSync(managedPath).uid, managedOwnership.uid)
  assert.equal(statSync(managedPath).gid, managedOwnership.gid)
  assert.equal(statSync(manifestPath).uid, manifestOwnership.uid)
  assert.equal(statSync(manifestPath).gid, manifestOwnership.gid)
  assert.equal(
    readdirSync(join(cwd, '.cnad', 'method')).some((name) => name.includes('.cnad-update-backup-')) ||
      readdirSync(join(cwd, '.cnad')).some((name) => name.includes('.cnad-update-backup-')),
    false,
  )
})
