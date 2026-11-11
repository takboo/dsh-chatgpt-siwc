import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import React from 'react'
import { parse } from 'yaml'

const root = new URL('../../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const [{ insert: rows }] = parse(await readFile(new URL(manifest.dsh.bundle.patch, root), 'utf8'))
const [row] = rows

test('Cordis loads and unloads the Host row declared in the bundle', async (t) => {
  const ctx = new Context()
  const runtime = ctx.plugin(Llm)
  const loader = ctx.plugin(Loader, { baseUrl: root.href })
  t.after(async () => {
    await loader.dispose()
    await runtime.dispose()
  })
  await Promise.all([runtime, loader])

  const other = 'other-provider'
  ctx.llm.registerAdapter([other], new LlmAdapter())
  await ctx.loader.root.update(rows)
  await ctx.loader.await()
  assert.deepEqual(ctx.llm.listProviders().map(provider => provider.id).sort(), [row.id, other])
  assert.deepEqual(await ctx.llm.listModels(row.id), [])

  t.mock.method(globalThis, 'fetch', async () => assert.fail('P1 must not make model requests'))
  const base = Object.freeze({ provider: row.id, model: 'synthetic', messages: Object.freeze([]) })
  for (const [controls, code] of [
    [{}, 'SIWC_UNAVAILABLE'],
    [{ maxTokens: 20, purpose: 'session-title' }, 'UNSUPPORTED_OPTION'],
    [{ maxTokens: 20, purpose: 'compaction' }, 'UNSUPPORTED_OPTION'],
    [{ maxTokens: 20 }, 'UNSUPPORTED_OPTION'],
    [{ temperature: 0.1 }, 'UNSUPPORTED_OPTION'],
    [{ stop: ['synthetic'] }, 'UNSUPPORTED_OPTION'],
  ]) {
    const chunks = await Array.fromAsync(ctx.llm.stream(Object.freeze({ ...base, ...controls })))
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].reason?.failure?.code, code)
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0)

  await ctx.loader.root.update([])
  await ctx.loader.await()
  assert.deepEqual(ctx.llm.listProviders().map(provider => provider.id), [other])
})

test('a duplicate route leaves its existing adapter registered', async (t) => {
  const ctx = new Context()
  const runtime = ctx.plugin(Llm)
  await runtime
  const entry = await import(row.name)
  const dispose = ctx.llm.registerAdapter([row.id], new LlmAdapter())
  const colliding = ctx.plugin(entry)
  t.after(async () => {
    await colliding.dispose()
    dispose()
    await runtime.dispose()
  })
  await assert.rejects(async () => { await colliding }, { code: 'DUPLICATE_ADAPTER' })
  assert.deepEqual(ctx.llm.listProviders(), [{ id: row.id, name: row.id }])
})

test('the shipped Client factory contributes settings to the plugin detail only', async () => {
  let client
  const source = await readFile(new URL(manifest.exports['./client'], root), 'utf8')
  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load({ id, factory }) {
          assert.equal(id, manifest.name)
          client = factory((external) => {
            assert.equal(external, 'react')
            return React
          })
        },
      },
    },
  })
  assert.deepEqual(Array.from(client.inject), ['locale', 'slots'])
  let dictionaries
  let section
  client.apply({
    effect(register) { register() },
    locale: {
      register(namespace, value) {
        assert.equal(namespace, row.id)
        dictionaries = value
      },
    },
    slots: {
      inject(slot, register) {
        assert.equal(slot, 'plugins.bundle.config')
        register()
      },
      register(options, render) { section = { options, render } },
    },
  })
  assert.equal(section.options.name, 'plugins.bundle.config')
  assert.equal(section.options.key, manifest.name)
  assert.equal(section.options.locale, row.id)
  for (const language of ['en', 'zh']) {
    const element = section.render({ view: 'page', t: (key) => dictionaries[language][key] })
    assert.equal(element.props.role, 'status')
    assert.equal(element.props.children, dictionaries[language].signInUnavailable)
  }
})
