import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attributionHeaders, BlockAssembler, createAssistantMessage, createSystemMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { sse, usage } from '../p0/sse.mjs'
import { canary, fixture, harness, resource } from '../p2/fixtures.mjs'

const route = { provider: 'chatgpt-siwc', model: 'fixture-z' }
const user = Object.freeze({ role: 'user', content: Object.freeze([Object.freeze({ type: 'text', text: 'Start.' })]) })
const options = { ...route, messages: [user] }
const toolSchema = { type: 'object', properties: {} }
const complete = (output, responseUsage) => ({ type: 'response.completed', response: { status: 'completed', output, usage: responseUsage } })
const message = text => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] })
const delta = (text, output_index = 0) => ({ type: 'response.output_text.delta', output_index, content_index: 0, delta: text })

async function inference(t) {
  const { state, dependencies } = fixture()
  const upstream = dependencies.fetch
  const captured = []
  let reply
  dependencies.fetch = async (input, init) => {
    if (String(input) !== resource + '/responses') return upstream(input, init)
    const request = new Request(input, init)
    const body = await request.json()
    captured.push({ request, body })
    assert.ok(reply, 'Unexpected inference request')
    return reply(body, init.signal)
  }
  const result = await harness(t, dependencies)
  await result.accounts.login()
  return { ...result, dependencies, state, captured, reply(handler) { reply = handler } }
}

test('session-id is stable across refresh and isolated by account and DSH session', async t => {
  const { ctx, accounts, captured, reply, state } = await inference(t)
  const original = (await accounts.view()).active
  const inSession = { ...options, sessionId: 'fixture-session-a' }
  reply(() => sse(complete([message('Fixture answer.')])))

  const prepared = await ctx.llm.prepareCall(route)
  await Array.fromAsync(prepared.stream(inSession))
  state.time += 300_000
  await Array.fromAsync(ctx.llm.stream(inSession))
  await Array.fromAsync(ctx.llm.stream({ ...options, sessionId: 'fixture-session-b' }))
  await Array.fromAsync(ctx.llm.stream(options))

  state.account = 'fixture-other-account'
  state.clientId = 'oaiapp_other_registration'
  await accounts.login()
  await Array.fromAsync(ctx.llm.stream(inSession))
  await accounts.activate(original)
  await Array.fromAsync(ctx.llm.stream(inSession))

  assert.equal(captured.length, 6)
  const headers = captured.map(({ request }) => request.headers)
  const [first, refreshed, otherSession, sessionless, otherAccount, reselected] = headers.map(header => header.get('session-id'))
  for (const value of [first, otherSession, otherAccount]) assert.match(value, /^[0-9a-f]{64}$/)
  assert.equal(new Set([first, otherSession, otherAccount]).size, 3)
  assert.notEqual(headers[0].get('authorization'), headers[1].get('authorization'))
  assert.equal(refreshed, first)
  assert.equal(reselected, first)
  assert.equal(sessionless, null)
  for (const { body } of captured) {
    assert.deepEqual(body, { model: route.model, input: [{ role: 'user', content: 'Start.' }],
      store: false, stream: true, include: ['reasoning.encrypted_content'] })
  }
})

test('image request projection handles offload and tool placeholders, and rejects unreadable images before fetch', async t => {
  const { ctx, accounts, state, captured, reply } = await inference(t)
  state.models[0].input_modalities = ['text', 'image']
  await accounts.models(true)
  const attachment = { attachmentId: 'sha256:' + 'a'.repeat(64), name: 'fixture.png',
    mediaType: 'image/png', bytes: 80, width: 1, height: 1 }
  const image = { type: 'image', attachment }
  let read = () => { throw new Error('sensitive native path') }
  let reads = 0
  ctx.provide('attachments', { async readImageRequest(...args) { reads++; return read(...args) } })
  const imageInput = { ...options, messages: [{ role: 'user', content: [image] }] }
  const unreadable = await Array.fromAsync(ctx.llm.stream(imageInput))
  assert.equal(unreadable.at(-1).reason.failure.code, 'INVALID_ATTACHMENT')
  assert.doesNotMatch(JSON.stringify(unreadable), /sensitive native path/)
  assert.equal(captured.length, 0)

  read = () => ({ data: Buffer.alloc(16 * 1024 * 1024), mediaType: 'image/png' })
  const overBudget = await Array.fromAsync(ctx.llm.stream(imageInput))
  assert.equal(overBudget.at(-1).reason.failure.code, 'IMAGE_OFFLOAD_REQUIRED')
  assert.equal(overBudget.at(-1).reason.failure.offloadImages, 1)
  assert.equal(captured.length, 0)

  reply(() => sse(complete([message('Final answer.')])))
  const toolCallId = 'call_with_tool_image'
  const result = await Array.fromAsync(ctx.llm.stream({ ...options, messages: [
    { role: 'user', content: [{ ...image, offloaded: true }] },
    createAssistantMessage({ content: [{ type: 'tool-call', id: toolCallId, name: 'fixture', arguments: '{}' }], source: route }),
    createToolResultMessage({ callId: toolCallId, content: [{ type: 'text', text: 'Tool read a file.' }, image], isError: false }),
    user,
  ] }))
  assert.deepEqual(result.at(-1).reason, { kind: 'stop' })
  assert.equal(reads, 2)
  const { input } = captured[0].body
  assert.match(input[0].content, /image omitted to fit request image limits/)
  assert.deepEqual(input[2], { type: 'function_call_output', call_id: toolCallId, output: 'Tool read a file.\n[tool result image omitted]\n' })
  assert.deepEqual(input[3], { role: 'user', content: 'Start.' })
  assert.ok(!JSON.stringify(input).includes('input_image'))
})

test('the prepared DSH route sends one restricted request and replays a namespaced tool exchange', async t => {
  const { ctx, captured, reply, dependencies, path, plugin, state } = await inference(t)
  const longName = 'fixture/tools/' + 'lookup-'.repeat(12)
  const tools = Object.freeze([
    Object.freeze({ name: longName, description: 'Lookup fixture', parameters: Object.freeze(toolSchema) }),
    Object.freeze({ name: longName + 'suffix', description: 'Second fixture tool', parameters: Object.freeze(toolSchema) }),
  ])
  reply(({ tools: [namespace] }) => {
    assert.equal(namespace.type, 'namespace')
    assert.equal(namespace.name, 'dsh')
    const [first, second] = namespace.tools
    assert.match(first.name, /^[A-Za-z0-9_-]{1,64}$/)
    assert.equal(first.name.slice(0, 22), second.name.slice(0, 22))
    assert.notEqual(first.name, second.name)
    const call = { type: 'function_call', namespace: 'dsh', name: first.name, call_id: 'call_1', arguments: '{"query":"test"}' }
    const reasoning = { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'opaque-fixture' }
    const final = complete([{ ...reasoning, encrypted_content: null }, call, { ...message('First answer.'), phase: 'commentary' }], {
      ...usage, input_tokens_details: { ...usage.input_tokens_details, cache_write_tokens: 2 },
    })
    return sse({ type: 'response.output_item.added', output_index: 1, item: call },
      delta('First ', 2), { type: 'response.output_item.done', output_index: 0, item: reasoning },
      delta('answer.', 2), final, final)
  })
  const prepared = await ctx.llm.prepareCall(route)
  assert.deepEqual(prepared.inputModalities, ['text'])
  assert.equal(prepared.systemPromptUpdate, 'in-history')
  const messages = Object.freeze([createSystemMessage('Initial instructions.'), user])
  const chunks = await Array.fromAsync(prepared.stream(Object.freeze({ ...options, messages, tools })))
  const { request, body } = captured[0]
  assert.equal(captured.length, 1)
  assert.equal(request.method, 'POST')
  assert.equal(request.redirect, 'error')
  assert.match(request.headers.get('authorization'), /^Bearer ey/)
  assert.equal(request.headers.get('user-agent'), attributionHeaders()['user-agent'])
  assert.equal(request.headers.has('openai-organization'), false)
  assert.equal(request.headers.has('openai-project'), false)
  assert.deepEqual(Object.keys(body).sort(), ['include', 'input', 'model', 'store', 'stream', 'tools'])
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
  assert.deepEqual(body.input, [{ role: 'developer', content: 'Initial instructions.' }, { role: 'user', content: 'Start.' }])
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text), ['First ', 'answer.'])
  assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 1)
  assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1)

  const assembler = new BlockAssembler()
  chunks.forEach(chunk => assembler.push(chunk))
  assert.deepEqual(assembler.finish, { kind: 'tool-calls' })
  assert.deepEqual(assembler.usage, {
    inputTokens: 5, outputTokens: 8, totalTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 2, reasoningTokens: 3,
  })
  const call = assembler.blocks().find(block => block.type === 'tool-call')
  assert.equal(call.name, longName)
  assert.equal(call.arguments, '{"query":"test"}')
  const assistant = JSON.parse(JSON.stringify(createAssistantMessage({
    content: assembler.blocks(),
    source: { ...route, replayState: assembler.replayState },
  })))
  const toolResult = createToolResultMessage({ callId: call.id, content: [{ type: 'text', text: 'Lookup fixture result.' }], isError: false })
  const next = { ...options, messages: [...messages, assistant, toolResult, createSystemMessage('Updated instructions.'), user], tools: [tools[1]] }
  await plugin.dispose()
  const restarted = await harness(t, dependencies, path)
  reply(() => sse(complete([message('Final answer.')])))
  const final = await Array.fromAsync(restarted.ctx.llm.stream(next))
  assert.deepEqual(final.at(-1).reason, { kind: 'stop' })
  assert.equal(final.some(chunk => chunk.type === 'usage'), false)
  const followup = captured[1].body
  assert.equal(followup.tools[0].tools.length, 1)
  assert.deepEqual(followup.input.slice(2), [
    { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'opaque-fixture' },
    { type: 'function_call', namespace: 'dsh', name: body.tools[0].tools[0].name, call_id: 'call_1', arguments: '{"query":"test"}' },
    { role: 'assistant', content: 'First answer.', phase: 'commentary' },
    { type: 'function_call_output', call_id: 'call_1', output: 'Lookup fixture result.' },
    { role: 'developer', content: 'Updated instructions.' },
    { role: 'user', content: 'Start.' },
  ])
  assert.doesNotMatch(JSON.stringify(assistant), /eyJ|synthetic-p2-sensitive-canary/)

  const future = structuredClone(next)
  future.messages[messages.length].source.replayState.response.version = 2
  const unsupportedReplay = await Array.fromAsync(restarted.ctx.llm.stream(future))
  assert.equal(unsupportedReplay.at(-1).reason.failure.code, 'INVALID_REPLAY')
  assert.equal(captured.length, 2)

  state.clientId = 'oaiapp_other_registration'
  await restarted.accounts.login()
  const other = await Array.fromAsync(restarted.ctx.llm.stream(next))
  assert.equal(other.at(-1).reason.failure.code, 'INVALID_REPLAY')
  assert.equal(captured.length, 2)
})

test('malformed, interrupted and failed attempts expose no executable tool blocks', async t => {
  const { ctx, captured, reply } = await inference(t)
  const cases = [
    ['EOF', 'TRANSPORT', call => sse(delta('partial'), { type: 'response.output_item.added', item: call })],
    ['quota', 'QUOTA', call => sse({ type: 'response.output_item.done', item: call }, {
      type: 'response.failed', response: { status: 'failed', error: { code: 'subscription_sharing_usage_limit_exceeded', message: canary }, usage },
    })],
    ['incomplete', 'INCOMPLETE_RESPONSE', () => sse({ type: 'response.incomplete', response: { status: 'incomplete' } })],
    ['unknown namespace', 'INVALID_RESPONSE', call => sse(complete([{ ...call, namespace: 'unoffered' }]))],
    ['unknown tool', 'INVALID_RESPONSE', call => sse(complete([{ ...call, name: 'unoffered' }]))],
    ['bad arguments', 'INVALID_RESPONSE', call => sse(complete([{ ...call, arguments: '[]' }]))],
    ['duplicate call IDs', 'INVALID_RESPONSE', call => sse(complete([call, call]))],
    ['inconsistent text', 'INVALID_RESPONSE', call => sse(delta('prefix'), complete([message('different'), call]))],
    ['unknown event', 'INVALID_RESPONSE', () => sse({ type: 'response.unexpected' })],
    ['malformed SSE', 'INVALID_RESPONSE', () => new Response('data: {broken\n\n', { headers: { 'content-type': 'text/event-stream' } })],
    ['HTTP 503', 'SERVER', () => Response.json({ error: { message: canary } }, { status: 503, headers: { 'x-request-id': 'req_fixture' } })],
  ]
  for (const [name, code, response] of cases) {
    await t.test(name, async () => {
      const prior = captured.length
      reply(body => response({
        type: 'function_call', namespace: 'dsh', name: body.tools[0].tools[0].name,
        call_id: 'call_bad', arguments: '{}',
      }))
      const chunks = await Array.fromAsync(ctx.llm.stream({ ...options, tools: [{ name: 'lookup', description: 'Fixture', parameters: toolSchema }] }))
      const finishes = chunks.filter(chunk => chunk.type === 'finish')
      assert.equal(finishes.length, 1)
      assert.equal(finishes[0].reason.failure.code, code)
      assert.equal(chunks.some(chunk => chunk.block?.type === 'tool-call' || chunk.blockType === 'tool-call'), false)
      assert.doesNotMatch(JSON.stringify(chunks), /synthetic-p2-sensitive-canary/)
      if (code === 'QUOTA') assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 1)
      if (code === 'SERVER') assert.equal(finishes[0].reason.failure.requestId, 'req_fixture')
      assert.equal(captured.length, prior + 1)
    })
  }
})

test('invalid Responses preserve only safe upstream facts', async t => {
  const { ctx, captured, reply } = await inference(t)
  const cases = [
    ['non-SSE', new Response(canary), 'req_fixture', 'ChatGPT did not return a Responses event stream.'],
    ['malformed SSE', new Response(`data: {${canary}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    }), 'req_fixture', 'ChatGPT returned a malformed stream event.'],
    ['unsupported event', sse({ type: canary }), canary, 'ChatGPT returned an invalid or unsupported stream event.'],
  ]
  for (const [name, response, requestId, message] of cases) {
    await t.test(name, async () => {
      response.headers.set('x-request-id', requestId)
      reply(() => response)
      const prior = captured.length
      const chunks = await Array.fromAsync(ctx.llm.stream(options))
      const failure = chunks.at(-1).reason.failure
      assert.equal(failure.code, 'INVALID_RESPONSE')
      assert.equal(failure.message, message)
      assert.equal(failure.status, 200)
      assert.equal(failure.requestId, requestId === canary ? undefined : requestId)
      assert.doesNotMatch(JSON.stringify(chunks), /synthetic-p2-sensitive-canary/)
      assert.equal(captured.length, prior + 1)
    })
  }
})

test('a Responses stream without Content-Type still requires valid SSE events', async t => {
  const { ctx, captured, reply } = await inference(t)
  const unlabeled = response => {
    response.headers.delete('content-type')
    return response
  }
  reply(() => unlabeled(sse(delta('OK'), complete([message('OK')], usage))))
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' })
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, 'OK')
  assert.equal(captured.length, 1)

  for (const response of [new Response('<html>Invalid</html>'), Response.json({ output: 'Invalid' })]) {
    reply(() => unlabeled(response))
    const invalid = await Array.fromAsync(ctx.llm.stream(options))
    assert.equal(invalid.length, 1)
    assert.equal(invalid[0].reason.failure.code, 'INVALID_RESPONSE')
  }
  assert.equal(captured.length, 3)
})

test('the completed event supplies the terminal status when the response omits status', async t => {
  const { ctx, captured, reply } = await inference(t)
  reply(() => sse(delta('OK'), { type: 'response.completed', response: { output: [message('OK')], usage } }))
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' })
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, 'OK')
  assert.equal(chunks.some(chunk => chunk.type === 'usage'), true)

  reply(() => sse({ type: 'response.completed', response: { status: 'incomplete', output: [message('OK')] } }))
  const inconsistent = await Array.fromAsync(ctx.llm.stream(options))
  assert.equal(inconsistent.length, 1)
  assert.equal(inconsistent[0].reason.failure.code, 'INVALID_RESPONSE')
  assert.match(inconsistent[0].reason.failure.message, /response\.completed\.status/)
  assert.equal(captured.length, 2)
})

test('a DSH conversation from the Pi route keeps the foreign tool call and result paired on replay', async t => {
  const { ctx, captured, reply } = await inference(t)
  const id = 'call_fixture|fc_fixture'
  const assistant = createAssistantMessage({
    source: { provider: 'openai', model: 'fixture-original' },
    content: [{ type: 'tool-call', id, name: 'lookup', arguments: '{"query":"fixture"}' }],
  })
  const result = createToolResultMessage({ callId: id, content: [{ type: 'text', text: 'Found.' }], isError: false })
  const history = [user, assistant, result, user]
  reply(() => sse(complete([message('OK')])))
  for (let repeat = 0; repeat < 2; repeat++) {
    const chunks = await Array.fromAsync(ctx.llm.stream({ ...options, messages: history }))
    assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' })
  }
  assert.equal(captured.length, 2)
  const [, call, output] = captured[0].body.input
  assert.equal(call.type, 'function_call')
  assert.match(call.call_id, /^[A-Za-z0-9_-]{1,64}$/)
  assert.equal(call.arguments, '{"query":"fixture"}')
  assert.deepEqual(output, { type: 'function_call_output', call_id: call.call_id, output: 'Found.' })
  assert.deepEqual(captured[1].body.input, captured[0].body.input)
  assert.equal(assistant.content[0].id, id)
  assert.equal(result.toolCallId, id)

  const wrong = createToolResultMessage({ callId: 'unrelated', content: result.content, isError: false })
  const invalid = await Array.fromAsync(ctx.llm.stream({ ...options, messages: [user, assistant, wrong] }))
  assert.equal(invalid.at(-1).reason.failure.code, 'INVALID_REQUEST')
  assert.equal(captured.length, 2)

  const longId = 'call_' + 'x'.repeat(60)
  const longCall = createAssistantMessage({
    source: assistant.source, content: [{ ...assistant.content[0], id: longId }],
  })
  const longResult = createToolResultMessage({ callId: longId, content: result.content, isError: false })
  const longReplay = await Array.fromAsync(ctx.llm.stream({ ...options, messages: [user, longCall, longResult, user] }))
  assert.deepEqual(longReplay.at(-1).reason, { kind: 'stop' })
  const [, wireLongCall, wireLongResult] = captured[2].body.input
  assert.match(wireLongCall.call_id, /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(wireLongCall.call_id, call.call_id)
  assert.equal(wireLongResult.call_id, wireLongCall.call_id)
})

test('empty completion retains usage and reports a retryable DSH failure', async t => {
  const { ctx, captured, reply } = await inference(t)
  reply(() => sse(complete([], usage)))
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.map(chunk => chunk.type), ['usage', 'finish'])
  assert.equal(chunks[0].usage.totalTokens, usage.total_tokens)
  assert.equal(chunks[1].reason.kind, 'error')
  assert.equal(chunks[1].reason.failure.code, 'EMPTY_RESPONSE')
  assert.equal(captured.length, 1)
})

test('an unfinished reasoning item leaves incomplete settlement and usage intact', async t => {
  const { ctx, captured, reply } = await inference(t)
  const reasoning = { type: 'reasoning', id: 'rs_incomplete', status: 'incomplete', summary: [], encrypted_content: null }
  reply(() => sse(
    { type: 'response.output_item.done', output_index: 0, item: reasoning },
    { type: 'response.incomplete', response: { status: 'incomplete', output: [reasoning], usage } },
  ))
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.map(chunk => chunk.type), ['usage', 'finish'])
  assert.equal(chunks[0].usage.totalTokens, usage.total_tokens)
  assert.equal(chunks[1].reason.failure.code, 'INCOMPLETE_RESPONSE')
  assert.equal(captured.length, 1)
})

test('HTTP and SSE context overflow reach the DSH compaction error taxonomy', async t => {
  const { ctx, captured, reply } = await inference(t)
  const error = { code: 'context_length_exceeded', message: canary }
  const responses = [
    () => Response.json({ error }, { status: 400, headers: { 'x-request-id': 'req_context' } }),
    () => {
      const response = sse({ type: 'response.failed', response: { status: 'failed', error, usage } })
      response.headers.set('x-request-id', 'req_context')
      return response
    },
  ]
  for (const [index, response] of responses.entries()) {
    reply(response)
    const chunks = await Array.fromAsync(ctx.llm.stream(options))
    const failure = chunks.at(-1).reason.failure
    assert.equal(failure.code, 'CONTEXT_WINDOW_EXCEEDED')
    assert.equal(failure.status, index === 0 ? 400 : 200)
    assert.equal(failure.requestId, 'req_context')
    assert.doesNotMatch(JSON.stringify(chunks), /synthetic-p2-sensitive-canary/)
  }
  assert.equal(captured.length, 2)
})

test('response metadata and keepalive do not replace or prevent completion', async t => {
  const { ctx, captured, reply } = await inference(t)
  const metadata = { type: 'response.metadata', sequence_number: 5, metadata: { value: canary } }
  const keepalive = { type: 'keepalive' }
  reply(() => {
    const response = sse(delta('O'), metadata, keepalive, delta('K'), complete([message('OK')], usage))
    response.headers.delete('content-type')
    return response
  })
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' })
  assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, 'OK')
  assert.equal(chunks.some(chunk => chunk.type === 'usage'), true)
  assert.doesNotMatch(JSON.stringify(chunks), /synthetic-p2-sensitive-canary/)

  reply(() => sse(delta('OK'), metadata, keepalive))
  const interrupted = await Array.fromAsync(ctx.llm.stream(options))
  assert.equal(interrupted.at(-1).reason.failure.code, 'TRANSPORT')
  assert.equal(captured.length, 2)
})

test('interleaved text keeps stable indices and deadline cancellation terminates the HTTP attempt', async t => {
  const { ctx, captured, reply } = await inference(t)
  reply(() => sse(delta('First '), delta('Second ', 1), delta('block.'), delta('block.', 1),
    complete([message('First block.'), message('Second block.')])))
  const chunks = await Array.fromAsync(ctx.llm.stream(options))
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.index), [0, 1, 0, 1])
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'block-end').map(chunk => chunk.block.text), ['First block.', 'Second block.'])

  const timer = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => timer(fn, ms === 120_000 ? 50 : ms, ...args))
  let networkSignal
  reply((_body, signal) => {
    networkSignal = signal
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  const keepAlive = timer(() => {}, 1000)
  try {
    const timed = await Array.fromAsync(ctx.llm.stream(options))
    assert.equal(timed.at(-1).reason.failure.code, 'TIMEOUT')
    assert.equal(networkSignal.aborted, true)
    assert.equal(captured.length, 2)
  } finally {
    clearTimeout(keepAlive)
  }
})

test('unsupported options, stale prepared accounts and stopped readers cannot leak into another attempt', async t => {
  const { ctx, accounts, state, captured, reply } = await inference(t)
  for (const unsupported of [{ maxTokens: 20 }, { temperature: 0.2 }, { stop: [] }, { purpose: 'compaction' }]) {
    const chunks = await Array.fromAsync(ctx.llm.stream({ ...options, ...unsupported }))
    assert.equal(chunks.at(-1).reason.failure.code, 'UNSUPPORTED_OPTION')
  }
  const stale = await ctx.llm.prepareCall(route)
  state.clientId = 'oaiapp_alternate'
  await accounts.login()
  const rejected = await Array.fromAsync(stale.stream(options))
  assert.equal(rejected.at(-1).reason.kind, 'aborted')
  assert.equal(captured.length, 0)

  let networkSignal
  reply((_body, signal) => {
    networkSignal = signal
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(delta('pending')) + '\n\n')) },
    }), { headers: { 'content-type': 'text/event-stream' } })
  })
  const iterator = ctx.llm.stream(options)[Symbol.asyncIterator]()
  assert.equal((await iterator.next()).value.type, 'block-start')
  await iterator.return()
  assert.equal(networkSignal.aborted, true)
  assert.equal(captured.length, 1)
})

test('caller stop cancels the HTTP body and settles the open stream once', async t => {
  const { ctx, captured, reply } = await inference(t)
  const stop = new AbortController()
  const cancelled = Promise.withResolvers()
  let networkSignal
  reply((_body, signal) => {
    networkSignal = signal
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(delta('partial')) + '\n\n')) },
      cancel() { cancelled.resolve() },
    }), { headers: { 'content-type': 'text/event-stream' } })
  })
  const iterator = ctx.llm.stream({ ...options, signal: stop.signal })[Symbol.asyncIterator]()
  assert.equal((await iterator.next()).value.type, 'block-start')
  assert.equal((await iterator.next()).value.type, 'text-delta')
  const remaining = Array.fromAsync(iterator)
  stop.abort()
  const chunks = await remaining
  await cancelled.promise
  assert.equal(networkSignal.aborted, true)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].type, 'finish')
  assert.equal(chunks[0].reason.kind, 'aborted')
  assert.equal(captured.length, 1)
})
