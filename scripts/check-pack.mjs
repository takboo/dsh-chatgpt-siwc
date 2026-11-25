import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { parse } from 'yaml'

let stageHostDir = null
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (arg === '--stage-host' && stageHostDir === null && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
    stageHostDir = process.argv[++i]
  } else {
    console.error('Usage: node scripts/check-pack.mjs [--stage-host <dir>]')
    process.exit(2)
  }
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-siwc-pack-'))
try {
  const [pack] = JSON.parse(execFileSync(process.execPath, [
    process.env.npm_execpath, 'pack', '--json', '--ignore-scripts',
    '--cache', join(temporary, 'cache'), '--pack-destination', temporary,
  ], { encoding: 'utf8' }))
  const tarball = join(temporary, pack.filename)
  const read = (path) => execFileSync('tar', ['-xOzf', tarball, 'package/' + path], { encoding: 'utf8' })
  const manifest = JSON.parse(read('package.json'))
  const [patch] = parse(read(manifest.dsh.bundle.patch.replace(/^\.\//, '')))
  assert.deepEqual(patch, { insert: [{ id: 'chatgpt-siwc', name: manifest.name }] })
  assert.equal(manifest.engines.dsh, '0.2.2-rc.1')
  assert.equal(manifest.license, 'MIT')

  const files = new Set(['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'locale/en.json', 'locale/zh.json'])
  for (const path of [manifest.dsh.bundle.patch, manifest.icon, ...Object.values(manifest.exports)]) {
    if (!path.includes('*')) files.add(posix.normalize(path))
  }
  assert.deepEqual(new Set(pack.files.map(({ path }) => path)), files)
  const zodLicense = await readFile(new URL('../node_modules/zod/LICENSE', import.meta.url), 'utf8')
  assert.ok(read('THIRD_PARTY_NOTICES.md').includes(zodLicense.trim()))
  for (const entry of [manifest.exports['.'], manifest.exports['./client'], manifest.exports['./typert']]) {
    assert.equal(read(posix.normalize(entry)), await readFile(entry, 'utf8'))
  }

  for (const language of ['en', 'zh']) {
    const { meta } = JSON.parse(read(`locale/${language}.json`))
    assert.ok(meta.title.trim())
    assert.ok(meta.description.trim())
  }

  const hash = createHash('sha256').update(await readFile(tarball)).digest('hex')
  const destination = join('artifacts', 'pack', hash)
  await mkdir(destination, { recursive: true })
  const output = join(destination, pack.filename)
  await copyFile(tarball, output)
  if (stageHostDir) {
    await mkdir(stageHostDir, { recursive: true })
    const stagedReport = join(stageHostDir, 'report.json')
    const existingReport = await lstat(stagedReport).catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)))
    if (existingReport) throw new Error(`Refusing to reuse staging directory with existing report: ${stagedReport}`)
    const stagedTarball = join(stageHostDir, 'candidate.tgz')
    await copyFile(tarball, stagedTarball, constants.COPYFILE_EXCL)
    console.log(`Staged ${stagedTarball}`)
  }
  console.log(`${output}\nSHA-256 ${hash}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
