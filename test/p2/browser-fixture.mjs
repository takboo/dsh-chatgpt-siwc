import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const [source, output] = process.argv.slice(2)
assert.ok(source && output, 'Pass the pinned DSH source tree and a fixture directory')
const upstream = resolve(source, 'packages/client')
await mkdir(output, { recursive: true })
await copyFile('dist/client.js', join(output, 'plugin.js'))

await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import React from 'react'
      import * as jsxRuntime from 'react/jsx-runtime'
      import { createRoot } from 'react-dom/client'
      import { Button } from ${JSON.stringify(join(upstream, 'ui-primitives/src/Button.tsx'))}
      import { Tag } from ${JSON.stringify(join(upstream, 'ui-primitives/src/Tag.tsx'))}
      import ${JSON.stringify(join(upstream, 'ui-theme/src/styles/base.css'))}
      import ${JSON.stringify(join(upstream, 'ui-theme/src/styles/design-platform.css'))}

      const params = new URLSearchParams(location.search)
      const available = params.get('offline') !== '1'
      if (params.get('dark') === '1') {
        document.body.setAttribute('data-ds-dark-theme', '')
        document.documentElement.style.colorScheme = 'dark'
      }
      const lang = params.get('lang') ?? 'en'
      document.documentElement.lang = lang
      document.getElementById('heading').textContent = lang === 'zh' ? 'ChatGPT 订阅' : 'ChatGPT Plan'
      const id = 'c149080e-6cf5-4ccc-a571-65fa173d35f5'
      const accounts = [{ id, label: 'j•••@example.invalid · c14908', status: 'connected' }]
      let view = { available, authorizing: false, accounts: [], active: null, confirmPlan: false, models: null }
      let dictionaries
      let panel
      const remote = {
        async settings(action) {
          switch (action.type) {
            case 'login':
              view = { ...view, accounts, active: id, confirmPlan: true }
              break
            case 'confirm':
              view = { ...view, confirmPlan: false }
              break
            case 'reload':
              if (params.get('quota') === '1') return { ok: true, value: { ok: false, error: 'quota' } }
              view = { ...view, models: [
                { id: 'test-model-a', name: 'Fixture Reasoning' },
                { id: 'test-model-b', name: 'Fixture Fast' },
              ] }
              break
            case 'logout':
              view = { ...view, accounts: [{ ...accounts[0], status: 'signedOut' }], active: null, models: null }
              return { ok: true, value: { ok: true, view, revocation: 'unconfirmed' } }
          }
          return { ok: true, value: { ok: true, view } }
        },
      }
      window.__ModuleLoader__ = {
        load({ factory }) {
          const client = factory((id) => ({
            react: React, 'react/jsx-runtime': jsxRuntime, '@deepseek-ai/dsh-client-ui-primitives': { Button, Tag },
          })[id])
          client.apply({
            remote: { async $mount() { return () => {} } },
            get() { return remote },
            effect(register) { register() },
            locale: { register(_, value) { dictionaries = value } },
            slots: {
              inject(name, register) { if (name === 'plugins.bundle.config') register() },
              register(_, render) { panel = render },
            },
          })
          createRoot(document.getElementById('root')).render(panel({
            view: 'page', t: key => dictionaries[lang][key],
          }))
        },
      }
    `,
  },
  bundle: true,
  outfile: join(output, 'fixture.js'),
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.module.css': 'local-css' },
  nodePaths: [resolve('node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
})

await writeFile(join(output, 'index.html'), `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="fixture.css">
<style>
  body { margin: 0; font: 14px var(--dsw-font-family); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
  main { box-sizing: border-box; max-width: 680px; margin: 0 auto; padding: 20px 16px; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  a { color: var(--dsw-alias-label-primary); }
</style>
<main><h1 id="heading"></h1><div id="root"></div></main>
<script src="fixture.js"></script>
<script src="plugin.js"></script>
`)
