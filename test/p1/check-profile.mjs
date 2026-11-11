import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { parse } from 'yaml'

const source = process.argv[2]
assert.ok(source, 'Pass a source tree for DSH dsh-v0.2.2-rc.1')
const read = (path) => readFile(join(source, path), 'utf8')
const parsePatch = (text) => parse(text, { logLevel: 'silent' })
const base = 'packages/bundle/base'
const web = 'packages/bundle/web-app'
const cliManifest = JSON.parse(await read('apps/cli/package.json'))
assert.equal(cliManifest.version, '0.2.2-rc.1')
const desktopProfile = await read('apps/desktop/src/project-manager.ts')
assert.match(desktopProfile, /WEB_PROFILE = PROFILE_TEMPLATES\.web/)
assert.match(desktopProfile, /initProfile\(projectDir, WEB_PROFILE\.bundles\)/)

const templates = await read('packages/util/official-bundles/src/bundles.ts')
assert.match(templates, /web:\s*\{\s*bundles:\s*\['@deepseek-ai\/dsh-base', '@deepseek-ai\/dsh-web-app'\]/)

const webManifest = JSON.parse(await read(join(web, 'package.json')))
const baseManifest = JSON.parse(await read(join(base, 'package.json')))
const bundlePaths = [
  join(base, baseManifest.dsh.bundle.patch),
  ...webManifest.dsh.bundle.patch.map(path => join(web, path)),
]
const bundlePatches = (await Promise.all(bundlePaths.map(read))).flatMap(parsePatch)
const pluginPatch = parsePatch(await readFile(new URL('../../cordis.patch.yml', import.meta.url), 'utf8'))
const warnings = []
const warn = (message) => { warnings.push(message) }
const original = applyEntryPatches([], bundlePatches, warn)
const profile = applyEntryPatches([], [...bundlePatches, ...pluginPatch], warn)

// The user-layer override is built from the upstream preset config because the
// public patch seam replaces a preset's config wholesale.
const presets = profile.filter(row => row.name === '@deepseek-ai/dsh-agent-preset')
assert.equal(presets.length, 4)
const userPatch = [{ id: 'session-title-llm', disabled: true }, { id: 'chatgpt-siwc', config: { enableLiveOAuth: true } }]
for (const preset of presets) {
  const config = structuredClone(preset.config)
  const group = config.plugins.find(row => row.id === 'compaction')
  const basic = group.config.find(row => row.id === 'compaction-basic')
  const command = group.config.find(row => row.id === 'command-compact')
  basic.config = { ...basic.config, auto: false }
  command.disabled = true
  userPatch.push({ id: preset.id, config })
}
const result = applyEntryPatches(profile, userPatch, warn)
assert.deepEqual(warnings, [])
assert.equal(original.find(row => row.id === 'session-title-llm').disabled, undefined)
assert.equal(result.find(row => row.id === 'session-title-llm').disabled, true)
assert.equal(result.find(row => row.id === 'session-title').disabled, undefined)
assert.equal(result.find(row => row.id === 'compaction-basic').disabled, true)
assert.equal(result.find(row => row.id === 'command-compact').disabled, true)
assert.equal(result.find(row => row.id === 'chatgpt-siwc').name, '@local/dsh-chatgpt-siwc')
assert.equal(profile.find(row => row.id === 'chatgpt-siwc').config, undefined)
assert.deepEqual(result.find(row => row.id === 'chatgpt-siwc').config, { enableLiveOAuth: true })
for (const preset of presets) {
  const updated = result.find(row => row.id === preset.id)
  const children = updated.config.plugins.find(row => row.id === 'compaction').config
  assert.equal(children.find(row => row.id === 'compaction-basic').config.auto, false)
  assert.equal(children.find(row => row.id === 'command-compact').disabled, true)
  assert.deepEqual(
    updated.config.plugins.filter(row => row.id !== 'compaction'),
    preset.config.plugins.filter(row => row.id !== 'compaction'),
  )
}
console.log('Web/Desktop shared source layers: plugin row, title and all four compaction preset overrides verified')
