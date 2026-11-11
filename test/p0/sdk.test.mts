import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import OpenAI from 'openai'
import type { Responses } from 'openai/resources/responses'
import { sse, usage } from './sse.mjs'

const baseURL = 'https://api.openai.com/v1'
const apiKey = 'fixture-access-token'
const body = {
  model: 'fixture-z',
  stream: true,
  store: false,
  include: ['reasoning.encrypted_content'],
  input: [
    { role: 'developer', content: 'Initial fixture instructions.' },
    { role: 'user', content: 'First turn.' },
    { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'synthetic-replay' },
    { type: 'function_call', namespace: 'dsh', name: 'lookup', call_id: 'call_fixture', arguments: '{}' },
    { type: 'function_call_output', call_id: 'call_fixture', output: 'Fixture tool result.' },
    { role: 'developer', content: 'Updated fixture instructions.' },
    { role: 'user', content: 'Second turn.' },
  ],
  tools: [{
    type: 'namespace',
    name: 'dsh',
    description: 'Local tools',
    tools: [{ type: 'function', name: 'lookup', description: 'Lookup fixture', parameters: {}, strict: false }],
  }],
} satisfies Responses.ResponseCreateParamsStreaming

function client(fetch: typeof globalThis.fetch) {
  return new OpenAI({
    apiKey, baseURL, fetch, maxRetries: 0, organization: null, project: null,
    defaultHeaders: attributionHeaders(),
    fetchOptions: { redirect: 'error' },
  })
}

test('SDK sends typed namespace/history/replay fields and exposes completed with usage', async () => {
  let requests = 0
  const sdk = client(async (input, init) => {
    requests += 1
    const request = new Request(input, init)
    assert.equal(request.url, baseURL + '/responses')
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('authorization'), 'Bearer ' + apiKey)
    assert.equal(request.headers.get('user-agent'), attributionHeaders()['user-agent'])
    assert.equal(request.headers.has('openai-organization'), false)
    assert.equal(request.headers.has('openai-project'), false)
    assert.equal(request.redirect, 'error')
    assert.deepEqual(await request.json(), body)
    return sse({ type: 'response.completed', response: { status: 'completed', usage } })
  })
  const stream = await sdk.responses.create(body)
  const events = await Array.fromAsync(stream)
  assert.equal(events.length, 1)
  const event = events[0]
  assert.equal(event.type, 'response.completed')
  if (event.type === 'response.completed') assert.deepEqual(event.response.usage, usage)
  assert.equal(requests, 1)
})

test('SDK exposes failed/incomplete and an unterminated EOF as different inputs to settlement', async () => {
  const delta = { type: 'response.output_text.delta', delta: 'partial fixture' }
  const endings = [
    { type: 'response.failed', response: { status: 'failed', error: { code: 'usage_limit_reached' } } },
    { type: 'response.incomplete', response: { status: 'incomplete' } },
    undefined,
  ]
  for (const ending of endings) {
    const sdk = client(async () => sse(...(ending === undefined ? [delta] : [delta, ending])))
    const events = await Array.fromAsync(await sdk.responses.create(body))
    assert.deepEqual(events.map(event => event.type), ending === undefined ? [delta.type] : [delta.type, ending.type])
  }
})

test('SDK makes one attempt on HTTP 503 and cancels an in-flight fetch', async () => {
  let requests = 0
  const sdk = client(async () => {
    requests += 1
    return Response.json({ detail: 'fixture unavailable' }, { status: 503 })
  })
  await assert.rejects(() => sdk.responses.create(body), { status: 503 })
  assert.equal(requests, 1)

  const controller = new AbortController()
  const aborting = client(async (_input, init) => {
    const signal = init?.signal
    assert.ok(signal)
    const aborted = new Promise<void>(resolve => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
    controller.abort()
    await aborted
    throw new DOMException('fixture abort', 'AbortError')
  })
  await assert.rejects(() => aborting.responses.create(body, { signal: controller.signal }), /Request was aborted/)
})
