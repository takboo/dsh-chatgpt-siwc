import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attributionHeaders, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { isolated, nativeHost, route, textResponse } from './native-host.mjs'

function options(model, text) {
  return Object.freeze({
    provider: route.provider, model,
    messages: Object.freeze([Object.freeze({
      role: 'user', content: Object.freeze([Object.freeze({ type: 'text', text })]),
    })]),
  })
}

function assertAborted(chunks) {
  const terminal = chunks.filter(chunk => chunk.type === 'finish')
  assert.equal(terminal.length, 1)
  assert.equal(terminal[0].reason.kind, 'aborted')
  assert.equal(terminal[0].reason.failure.code, 'ABORTED')
  assert.equal(chunks.some(chunk => chunk.block?.type === 'tool-call'), false)
}

function pendingRequest() {
  const entered = Promise.withResolvers()
  const ended = Promise.withResolvers()
  return {
    entered: entered.promise, ended: ended.promise,
    wait(signal) {
      entered.resolve(signal)
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          ended.resolve()
          reject(signal.reason)
        }, { once: true })
      })
    },
  }
}

test('concurrent prepared calls isolate the selected model and request body', async t => {
  const { ctx, requests, replies } = await nativeHost(await isolated(t))
  try {
    const first = options('fixture-z', 'First concurrent message.')
    const second = options('fixture-a', 'Second concurrent message.')
    const entered = new Map()
    const ready = Promise.withResolvers()
    const respond = (body, request) => {
      const completion = Promise.withResolvers()
      entered.set(body.model, { body, request, completion })
      if (entered.size === 2) ready.resolve()
      return completion.promise
    }
    replies.push(respond, respond)
    const [preparedFirst, preparedSecond] = await Promise.all(
      [first, second].map(({ provider, model }) => ctx.llm.prepareCall({ provider, model })),
    )
    const firstStream = Array.fromAsync(preparedFirst.stream(first))
    const secondStream = Array.fromAsync(preparedSecond.stream(second))
    await ready.promise
    const a = entered.get(first.model)
    const b = entered.get(second.model)
    assert.deepEqual(a.body.input, [{ role: 'user', content: first.messages[0].content[0].text }])
    assert.deepEqual(b.body.input, [{ role: 'user', content: second.messages[0].content[0].text }])
    assert.match(a.request.headers.get('authorization'), /^Bearer ey/)
    assert.equal(b.request.headers.get('authorization'), a.request.headers.get('authorization'))
    assert.equal(a.request.headers.get('user-agent'), attributionHeaders()['user-agent'])
    assert.equal(b.request.headers.get('user-agent'), attributionHeaders()['user-agent'])
    assert.notEqual(a.request.signal, b.request.signal)
    b.completion.resolve(textResponse('Second answer.'))
    const secondChunks = await secondStream
    assert.equal(a.request.signal.aborted, false)
    a.completion.resolve(textResponse('First answer.'))
    const firstChunks = await firstStream
    assert.deepEqual(firstChunks.at(-1).reason, { kind: 'stop' })
    assert.deepEqual(secondChunks.at(-1).reason, { kind: 'stop' })
    assert.equal(firstChunks.find(chunk => chunk.type === 'block-end').block.text, 'First answer.')
    assert.equal(secondChunks.find(chunk => chunk.type === 'block-end').block.text, 'Second answer.')
    assert.equal(requests.length, 2)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('hot removal cancels the active SSE and catalog and does not hand an old prepared call to the new fiber', async t => {
  const { ctx, requests, replies, state, setEnabled } = await nativeHost(await isolated(t))
  try {
    ctx.llm.registerAdapter(['fixture-other'], new class extends LlmAdapter {
      async *stream() { yield { type: 'finish', reason: { kind: 'stop' } } }
    }())
    const query = options(route.model, 'An in-flight stream.')
    const stale = await ctx.llm.prepareCall(route)
    const cancelBody = Promise.withResolvers()
    let transportSignal
    replies.push((_body, request) => {
      transportSignal = request.signal
      const delta = { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'Pending text.' }
      return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(delta) + '\n\n')) },
        cancel() { cancelBody.resolve() },
      }), { headers: { 'content-type': 'text/event-stream' } })
    })
    const stream = ctx.llm.stream(query)[Symbol.asyncIterator]()
    assert.equal((await stream.next()).value.type, 'block-start')
    assert.equal((await stream.next()).value.type, 'text-delta')
    const remaining = Array.fromAsync(stream)

    const catalog = pendingRequest()
    state.time += 61_000
    state.modelResponse = catalog.wait
    const models = ctx.llm.listModels(route.provider)
    const catalogSignal = await catalog.entered
    await setEnabled(false)
    assert.equal(transportSignal.aborted, true)
    assert.equal(catalogSignal.aborted, true)
    await Promise.all([cancelBody.promise, catalog.ended])
    assertAborted(await remaining)
    assert.deepEqual(await models, [])
    assert.deepEqual(ctx.llm.listProviders().map(provider => provider.id), ['fixture-other'])
    const other = await Array.fromAsync(ctx.llm.stream({ ...query, provider: 'fixture-other' }))
    assert.deepEqual(other.at(-1).reason, { kind: 'stop' })

    state.modelResponse = undefined
    await setEnabled(true)
    assertAborted(await Array.fromAsync(stale.stream(query)))
    assert.equal(requests.length, 1)
    replies.push(() => textResponse())
    const remounted = await Array.fromAsync(ctx.llm.stream(query))
    assert.deepEqual(remounted.at(-1).reason, { kind: 'stop' })
    assert.equal(requests.length, 2)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('hot removal cancels a pending OAuth refresh before inference dispatch', async t => {
  const { ctx, requests, state, setEnabled } = await nativeHost(await isolated(t))
  try {
    state.time += 400_000
    const refresh = pendingRequest()
    state.refreshDelay = refresh.wait
    const active = Array.fromAsync(ctx.llm.stream(options(route.model, 'Wait for a synthetic refresh.')))
    const refreshSignal = await refresh.entered
    await setEnabled(false)
    assert.equal(refreshSignal.aborted, true)
    await refresh.ended
    assertAborted(await active)
    assert.equal(requests.length, 0)
    assert.equal(ctx.llm.listProviders().length, 0)
  } finally {
    await ctx.fiber.dispose()
  }
})
