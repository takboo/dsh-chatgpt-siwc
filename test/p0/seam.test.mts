import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Authorization from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import Llm, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'

const provider = 'chatgpt-siwc-fixture'
const account = credentialKey(provider, 'synthetic-registration')
const listing = {
  models: [
    { slug: 'fixture-z', display_name: 'Fixture Z', visibility: 'list', extra: 'ignored' },
    { slug: 'fixture-hidden', display_name: 'Hidden', visibility: 'hidden' },
    { slug: 'fixture-a', display_name: 'Fixture A', visibility: 'list' },
  ],
}
const grant = { kind: 'grant', payload: { registration: 'synthetic-registration' } } as const

test('published DSH seams mount and dispose a fixture route and authorization flow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-siwc-p0-'))
  const path = join(dir, 'credentials.yaml')
  const ctx = new Context()
  let dispatches = 0
  const updates: string[] = []

  class FixtureAdapter extends LlmAdapter {
    override async listModels(): Promise<readonly LlmModelInfo[]> {
      if (await ctx.credentials.readRecord(account) === undefined) return []
      return listing.models.filter(model => model.visibility === 'list')
        .map(model => ({ provider, id: model.slug, name: model.display_name, inputModalities: ['text'] }))
    }

    override async *stream(): AsyncIterable<StreamChunk> {
      dispatches += 1
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }

  const base = [
    ctx.plugin(Llm),
    ctx.plugin(LocalCredentials, { path, watch: false }),
    ctx.plugin(Authorization),
  ]
  try {
    await Promise.all(base)
    ctx.on('llm/models-updated', route => { updates.push(route) })
    const adapter = new FixtureAdapter()
    const plugin = ctx.plugin({
      inject: ['llm', 'authorization'],
      apply(child) {
        child.llm.registerAdapter([provider], adapter)
        child.authorization.registerFlow({
          key: account,
          label: 'Fixture sign-in',
          methods: [{ id: 'fixture', label: 'Synthetic interaction' }],
          async run(session) {
            await session.commit(grant)
            child.emit('llm/models-updated', provider)
          },
        })
      },
    })
    try {
      await plugin
      assert.deepEqual(await ctx.llm.listModels(provider), [])
      const outcome = await ctx.authorization.begin({
        key: account,
        interaction: {
          notify: () => assert.fail('unexpected notice'),
          prompt: async () => assert.fail('unexpected prompt'),
        },
      })
      assert.deepEqual(outcome, { status: 'authorized' })
      assert.deepEqual(await ctx.credentials.readRecord(account), grant)
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      await ctx.credentials.modifyRecord(account, async record => {
        assert.deepEqual(record, grant)
        return undefined
      })
      assert.deepEqual(await ctx.credentials.readRecord(account), grant)
      assert.deepEqual((await ctx.llm.listModels(provider)).map(({ id, name }) => [id, name]), [
        ['fixture-z', 'Fixture Z'], ['fixture-a', 'Fixture A'],
      ])
      assert.deepEqual(updates, [provider])

      const prepared = await ctx.llm.prepareCall({ provider, model: 'fixture-z' })
      assert.equal(prepared.context, undefined)
      assert.equal(prepared.config.maxTokens, undefined)
      assert.equal(prepared.config.temperature, undefined)
      const request = { ...prepared.config, messages: [] }
      for await (const chunk of prepared.stream(request)) {
        assert.equal(chunk.type, 'finish')
      }
      await assert.rejects(async () => {
        for await (const _ of prepared.stream(request)) assert.fail('duplicate dispatch')
      }, { code: 'INVALID_PREPARED_CALL' })
      assert.equal(dispatches, 1)
      assert.throws(() => ctx.llm.registerAdapter([provider], adapter), { code: 'DUPLICATE_ADAPTER' })
    } finally {
      await plugin.dispose()
    }
    assert.equal(ctx.llm.listProviders().some(route => route.id === provider), false)
    assert.equal(ctx.authorization.describe(account), undefined)
    assert.deepEqual(await ctx.credentials.readRecord(account), grant)
  } finally {
    for (const fiber of base.reverse()) await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
