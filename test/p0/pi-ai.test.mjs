import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import Llm, { attributionHeaders, createSystemMessage } from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import { sse, usage } from './sse.mjs'

const baseURL = 'https://api.openai.com/v1'
const provider = 'chatgpt-siwc-fixture'
const apiKey = 'fixture-access-token'
const model = 'fixture-z'
const request = {
  provider, model,
  messages: [
    createSystemMessage('Initial instructions'),
    { role: 'user', content: [{ type: 'text', text: 'First turn' }] },
    createSystemMessage('Updated instructions'),
    { role: 'user', content: [{ type: 'text', text: 'Second turn' }] },
  ],
  tools: [{ name: 'lookup', description: 'Fixture lookup', parameters: { type: 'object' } }],
}

const delta = { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'partial' }
const textItem = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'partial', annotations: [] }],
}
const textAdded = { type: 'response.output_item.added', output_index: 0, item: { ...textItem, content: [] } }
const textDone = { type: 'response.output_item.done', output_index: 0, item: textItem }
function completed(responseUsage) {
  return sse(textAdded, delta, textDone, {
    type: 'response.completed', response: { status: 'completed', output: [textItem], usage: responseUsage },
  })
}
const incomplete = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }
const failed = { status: 'failed', error: { code: 'usage_limit_reached', message: 'fixture limit' }, usage }

test('public DSH pi-ai route exposes wire mismatches and rejects models[] discovery', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-siwc-pi-ai-'))
  const ctx = new Context()
  const ref = credentialRef('SIWC_FIXTURE_KEY')
  const base = [
    ctx.plugin(Llm),
    ctx.plugin(LocalCredentials, { path: join(dir, 'credentials.yaml'), watch: false }),
  ]
  const requests = []
  let reply
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init)
    assert.equal(request.headers.get('authorization'), 'Bearer ' + apiKey)
    assert.equal(request.headers.get('user-agent'), attributionHeaders()['user-agent'])
    if (request.method === 'GET') {
      assert.equal(request.url, baseURL + '/models')
      return Response.json({ models: [{ slug: model, display_name: 'Fixture Z', visibility: 'list' }] })
    }
    assert.equal(request.url, baseURL + '/responses')
    assert.equal(request.method, 'POST')
    requests.push(await request.json())
    return reply()
  })

  async function generate(response, options = {}) {
    reply = response
    return Array.fromAsync(ctx.llm.stream({ ...request, ...options }))
  }

  try {
    await Promise.all(base)
    await ctx.credentials.set(ref, apiKey)
    const adapter = ctx.plugin(piAi, {
      providers: {
        [provider]: {
          api: 'openai-responses', baseURL, apiKeyEnv: ref,
          compat: { supportsMaxOutputTokens: false },
          models: [{ id: model, contextWindow: 120000, maxTokens: 4096 }],
        },
      },
    })
    try {
      await adapter
      const unsupported = await generate(() => assert.fail('unexpected fetch'), { stop: ['END'] })
      assert.equal(unsupported.at(-1)?.reason?.failure?.code, 'UNSUPPORTED_OPTION')
      assert.equal(requests.length, 0)
      const chunks = await generate(
        () => completed(usage),
        { temperature: 0.5, maxTokens: 64 },
      )
      assert.equal(requests.length, 1)
      assert.equal(requests[0].store, false)
      assert.equal(requests[0].stream, true)
      assert.equal(requests[0].temperature, 0.5)
      assert.equal(Object.hasOwn(requests[0], 'max_output_tokens'), false)
      assert.equal(Object.hasOwn(requests[0], 'stop'), false)
      assert.equal(Object.hasOwn(requests[0], 'previous_response_id'), false)
      assert.equal(requests[0].tools[0].type, 'function')
      assert.equal(chunks.at(-1)?.reason?.kind, 'stop')
      const tokenUsage = chunks.find(chunk => chunk.type === 'usage')?.usage
      assert.equal(tokenUsage?.inputTokens, 7)
      assert.equal(tokenUsage?.cacheReadTokens, 5)
      assert.equal(tokenUsage?.outputTokens, 8)
      assert.equal(tokenUsage?.reasoningTokens, undefined)
      assert.equal(tokenUsage?.totalTokens, 20)

      assert.equal((await generate(() => sse(textAdded, delta))).at(-1)?.reason?.kind, 'error')
      const failure = await generate(() => sse(textAdded, delta, { type: 'response.failed', response: failed }))
      assert.equal(failure.at(-1)?.reason?.kind, 'error')
      assert.equal(failure.some(chunk => chunk.type === 'usage' && chunk.usage.totalTokens === 20), false)
      assert.equal((await generate(
        () => sse(textAdded, delta, { type: 'response.incomplete', response: incomplete }),
      )).at(-1)?.reason?.kind, 'max-tokens')
      const missingUsage = await generate(() => completed(undefined))
      assert.equal(missingUsage.at(-1)?.reason?.kind, 'stop')
      assert.deepEqual(requests[0].input.map(item => item.role), ['system', 'user', 'user', 'user'])
      assert.deepEqual(missingUsage.find(chunk => chunk.type === 'usage')?.usage, {
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
      })

      const tools = ['alpha', 'beta'].map((namespace, index) => ({
        type: 'function_call', namespace, name: 'lookup', id: 'fc_fixture_' + index,
        call_id: 'call_fixture_' + index, arguments: '{}',
      }))
      const toolChunks = await generate(() => sse(
        ...tools.map((item, output_index) => ({ type: 'response.output_item.added', output_index, item })),
        { type: 'response.function_call_arguments.delta', output_index: 1, delta: '{}' },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' },
        { type: 'response.output_item.done', output_index: 1, item: tools[1] },
        { type: 'response.output_item.done', output_index: 0, item: tools[0] },
        { type: 'response.completed', response: { status: 'completed', output: tools, usage } },
      ))
      assert.equal(toolChunks.at(-1)?.reason?.kind, 'tool-calls')
      const blocks = toolChunks.filter(chunk => chunk.type === 'block-end')
      assert.deepEqual(blocks.map(chunk => chunk.index), [1, 0])
      assert.deepEqual(blocks.map(chunk => chunk.block.name), ['lookup', 'lookup'])
      assert.notEqual(blocks[0].block.id, blocks[1].block.id)

      const prior = requests.length
      const unavailable = await generate(() => Response.json({ detail: 'fixture unavailable' }, { status: 503 }))
      assert.equal(unavailable.at(-1)?.reason?.kind, 'error')
      assert.equal(requests.length, prior + 1)
      await assert.rejects(() => ctx.llm.discoverModels('llm-pi-ai', {
        baseURL, api: 'openai-responses', apiKey,
      }), /neither a "data" array nor a "models" object/)
    } finally {
      await adapter.dispose()
    }
  } finally {
    for (const fiber of base.reverse()) await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
