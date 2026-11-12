import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { sse } from '../p0/sse.mjs'
import { assertTurnCompleted, completed, eventsOf, followup, isolated, nativeHost, opaqueReasoning, readStored, route, textResponse } from './native-host.mjs'

function assistant(text) {
  return { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }
}

test('native image capability follows the catalog and replays ordered user images from durable references', async t => {
  const { ctx, workspace, replies, requests, state } = await nativeHost(await isolated(t), { signIn: false })
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=', 'base64')
  const attachment = Object.freeze({
    attachmentId: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length, mediaType: 'image/png', width: 1, height: 1,
  })
  const image = Object.freeze({ type: 'image', attachment })
  state.models[0].input_modalities = ['text', 'audio', 'image']
  state.models.push({ slug: 'invalid-modality', display_name: 'Invalid modality', visibility: 'list', input_modalities: 'image' })
  let handle
  try {
    await ctx.get('siwcFixture').accounts.login()
    const resolve = () => ctx.llm.resolveModelInfo(route.provider, route.model)
    assert.deepEqual((await resolve()).inputModalities, ['text'])
    const reads = []
    ctx.provide('attachments', {
      async readImageRequest(ref, target, signal) {
        assert.deepEqual(ref, attachment)
        assert.deepEqual(target, { width: 1, height: 1, maxBytes: bytes.length })
        assert.ok(signal instanceof AbortSignal)
        reads.push(ref.attachmentId)
        return { data: bytes, mediaType: 'image/png' }
      },
    })
    assert.deepEqual((await resolve()).inputModalities, ['text', 'image'])
    assert.deepEqual((await ctx.llm.resolveModelInfo(route.provider, 'invalid-modality')).inputModalities, ['text'])
    assert.deepEqual((await ctx.llm.listModels(route.provider)).find(model => model.id === route.model).inputModalities, ['text', 'image'])

    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: route })
    replies.push(() => textResponse('LEFT'))
    assertTurnCompleted(await followup(ctx, handle.agent, [
      { type: 'text', text: 'Look at this:' }, image, { type: 'text', text: 'Read the left marker.' },
    ]), 1)
    replies.push(() => textResponse('RIGHT'))
    assertTurnCompleted(await followup(ctx, handle.agent, 'Read the right marker.'), 2)
    const firstUser = { role: 'user', content: [
      { type: 'input_text', text: 'Look at this:' },
      { type: 'input_image', image_url: 'data:image/png;base64,' + bytes.toString('base64'), detail: 'auto' },
      { type: 'input_text', text: 'Read the left marker.' },
    ] }
    for (const request of requests) {
      assert.deepEqual(request.input.filter(item => item.role === 'user' && Array.isArray(item.content)), [firstUser])
    }
    assert.ok(requests[1].input.some(item => item.role === 'user' && item.content === 'Read the right marker.'))
    assert.deepEqual(reads, [attachment.attachmentId, attachment.attachmentId])
    const sessionId = handle.agent.session.id
    await handle.dispose()
    handle = undefined
    const stored = JSON.stringify(await readStored(ctx, sessionId))
    assert.ok(stored.includes(attachment.attachmentId))
    assert.ok(!stored.includes(bytes.toString('base64')))
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})

test('native reasoning choices send the selected effort and keep same-session history', async t => {
  const { ctx, workspace, replies, requests, state } = await nativeHost(await isolated(t), { signIn: false })
  const tested = { provider: route.provider, model: 'gpt-6.1-sol' }
  const levels = ['low', 'medium', 'high', 'xhigh', 'max']
  const entries = [...levels, 'ultra', 'high'].map(effort => ({ effort }))
  state.models[0].supported_reasoning_levels = [{ effort: 'ultra' }]
  state.models.push({
    slug: tested.model, display_name: 'GPT-6.1 Sol', visibility: 'list',
    supported_reasoning_levels: [null, ...entries], default_reasoning_level: 'medium',
  })
  let handle
  try {
    await ctx.get('siwcFixture').accounts.login()
    const info = await ctx.llm.resolveModelInfo(tested.provider, tested.model)
    assert.deepEqual(info.reasoning?.efforts.map(effort => effort.id), levels)
    assert.equal(info.reasoning?.defaultEffort, undefined)
    assert.equal((await ctx.llm.resolveModelInfo(route.provider, route.model)).reasoning, undefined)
    const select = effort => ({ ...tested, reasoningEffort: ReasoningEffortId(effort) })
    await assert.rejects(ctx.llm.prepareCall(select('ultra')), error => error.failure?.code === 'UNSUPPORTED_REASONING_EFFORT')
    assert.equal(requests.length, 0)

    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: tested })
    handle.agent.model.select(select('high'))
    replies.push(() => completed(opaqueReasoning, assistant('I will remember it.')))
    assertTurnCompleted(await followup(ctx, handle.agent, 'Remember ALDER-73.'), 1)
    handle.agent.model.select(select('max'))
    replies.push(() => textResponse('ALDER-73'))
    assertTurnCompleted(await followup(ctx, handle.agent, 'What was the marker?'), 2)
    handle.agent.model.select(tested)
    replies.push(() => textResponse())
    assertTurnCompleted(await followup(ctx, handle.agent, 'Use the provider default.'), 3)

    assert.deepEqual(requests.map(body => body.reasoning), [{ effort: 'high' }, { effort: 'max' }, undefined])
    assert.ok(requests[1].input.some(item => item.role === 'user' && item.content === 'Remember ALDER-73.'))
    assert.deepEqual(requests[1].input.find(item => item.type === 'reasoning'), opaqueReasoning)
    assert.equal(requests[1].input.some(item => item.type === 'configuration_update'), false)
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})

test('native reasoning choices follow each model and newly listed models after catalog refresh', async t => {
  const { ctx, replies, requests, state } = await nativeHost(await isolated(t))
  const other = { ...route, model: 'fixture-a' }
  const added = { ...route, model: 'fixture-new-model' }
  const levels = (...efforts) => efforts.map(effort => ({ effort }))
  state.models[0].supported_reasoning_levels = levels('high', 'ultra', 'low', 'high')
  state.models.find(model => model.slug === other.model).supported_reasoning_levels = levels('xhigh', 'medium')
  const modelIds = async () => (await ctx.llm.listModels(route.provider)).map(model => model.id)
  const reasoningIds = async ({ provider, model }) =>
    (await ctx.llm.resolveModelInfo(provider, model)).reasoning?.efforts.map(effort => effort.id)
  const select = (model, effort) => ({ ...model, reasoningEffort: ReasoningEffortId(effort) })
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'Check the selected effort.' }] }]
  try {
    assert.deepEqual(await modelIds(), [route.model, other.model])
    assert.deepEqual(await reasoningIds(route), ['low', 'high'])
    assert.deepEqual(await reasoningIds(other), ['medium', 'xhigh'])
    await assert.rejects(ctx.llm.prepareCall(select(other, 'high')), error => error.failure?.code === 'UNSUPPORTED_REASONING_EFFORT')
    assert.equal(requests.length, 0)

    state.models.push({
      slug: added.model, display_name: 'Newly Listed Model', visibility: 'list',
      supported_reasoning_levels: levels('ultra', 'max'), default_reasoning_level: 'max',
    })
    assert.deepEqual(await modelIds(), [route.model, other.model])
    state.time += 61_000
    assert.deepEqual(await modelIds(), [route.model, other.model, added.model])
    assert.deepEqual(await reasoningIds(added), ['max'])

    replies.push(() => textResponse(), () => textResponse(), () => textResponse(), () => textResponse())
    for (const selection of [select(route, 'low'), select(other, 'xhigh'), select(added, 'max'), added]) {
      const chunks = await Array.fromAsync(ctx.llm.stream({ ...selection, messages }))
      assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' })
    }
    assert.deepEqual(requests.map(({ model, reasoning }) => [model, reasoning?.effort]), [
      [route.model, 'low'], [other.model, 'xhigh'], [added.model, 'max'], [added.model, undefined],
    ])
    assert.equal(requests[3].reasoning, undefined)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('default compaction allows switching an existing session to a SIWC model with catalog capacity', async t => {
  const { ctx, workspace, replies, requests, state } = await nativeHost(await isolated(t), { signIn: false })
  const source = { provider: 'fixture-original', model: 'original' }
  const previousInput = 'Remember the fixture code ALDER-73.'
  state.models[0].context_window = 128000
  let handle
  try {
    await ctx.get('siwcFixture').accounts.login()
    await ctx.plugin(TokenMeter)
    ctx.llm.registerAdapter([source.provider], new class extends LlmAdapter {
      resolveModel(provider, id) {
        return { provider, id, name: id, context: { contextWindow: 200000 } }
      }

      async *stream() {
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'I will remember it.' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }())
    await ctx.plugin(BasicCompaction)
    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: source })
    assertTurnCompleted(await followup(ctx, handle.agent, previousInput), 1)
    handle.agent.model.select(route)
    replies.push(() => textResponse('ALDER-73'))
    const events = await followup(ctx, handle.agent, 'What is the fixture code?')
    assertTurnCompleted(events, 2)
    assert.equal(handle.agent.session.requestHeader().config.provider, route.provider)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].model, route.model)
    assert.equal('max_output_tokens' in requests[0], false)
    assert.ok(requests[0].input.some(item => item.role === 'user' && item.content === previousInput))
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})

test('the native compactor commits a checkpoint and the next SIWC request sends the rewritten history in order', async t => {
  const { ctx, workspace, replies, requests } = await nativeHost(await isolated(t))
  const checkpoint = 'Retained summary of the isolated fixture.'
  const older = 'Historical fixture facts. '.repeat(80)
  const retained = { ...opaqueReasoning, id: 'rs_retained_fixture', encrypted_content: 'opaque-retained-fixture' }
  const current = 'Continue from the checkpoint.'
  const summaryCalls = []
  let handle
  try {
    await ctx.plugin(TokenMeter)
    ctx.llm.registerAdapter(['fixture-summary'], new class extends LlmAdapter {
      async *stream(options) {
        summaryCalls.push(options)
        yield { type: 'block-end', index: 0, block: { type: 'text', text: checkpoint } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }())
    await ctx.plugin(BasicCompaction, {
      auto: false, summarizationProvider: 'fixture-summary', summarizationModel: 'fixture-summary', maxTokens: 96,
    })
    let instruction = 'Fixture instructions before compaction.'
    ctx.systemPrompt.section({ name: 'fixture-history', order: 0, text: () => instruction })
    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: route })
    replies.push(() => completed(opaqueReasoning, assistant('Old assistant answer.')))
    assertTurnCompleted(await followup(ctx, handle.agent, older), 1)
    replies.push(() => completed(retained, assistant('Retained assistant answer.')))
    assertTurnCompleted(await followup(ctx, handle.agent, 'Add a recent fact.'), 2)
    const sessionId = handle.agent.session.id
    const compacted = await ctx.compaction.compactNow(handle.agent, new AbortController().signal)
    assert.ok(compacted && compacted.shadowedSeqs.length >= 2)
    assert.equal(summaryCalls.length, 1)
    assert.equal(summaryCalls[0].purpose, 'compaction')
    assert.equal(summaryCalls[0].maxTokens, 96)
    assert.ok(summaryCalls[0].messages.some(item => item.content.some(block => block.text === older)))
    assert.equal(requests.length, 2)

    instruction = 'Fixture instructions after compaction.'
    replies.push(() => textResponse())
    assertTurnCompleted(await followup(ctx, handle.agent, current), 3)
    const body = requests[2]
    assert.equal(body.model, route.model)
    assert.equal(body.store, false)
    assert.equal(body.stream, true)
    assert.equal('previous_response_id' in body, false)
    assert.equal(body.input.some(item => item.role === 'system'), false)
    assert.doesNotMatch(JSON.stringify(body.input), /Historical fixture facts|Old assistant answer|opaque-native-fixture/)
    const summaryIndex = body.input.findIndex(item => item.role === 'user' && item.content.includes(checkpoint))
    const instructionIndex = body.input.findIndex(item => item.role === 'developer' && item.content.includes(instruction))
    const currentIndex = body.input.findIndex(item => item.role === 'user' && item.content === current)
    const retainedIndex = body.input.findIndex(item => item.id === retained.id)
    assert.ok(instructionIndex >= 0 && instructionIndex < summaryIndex && summaryIndex < retainedIndex && retainedIndex < currentIndex)
    assert.deepEqual(body.input[retainedIndex], retained)
    assert.deepEqual(body.input[retainedIndex + 1], { role: 'assistant', content: 'Retained assistant answer.' })
    assert.equal(body.input.filter(item => item.content?.includes(checkpoint)).length, 1)
    await handle.dispose()
    handle = undefined
    const stored = await readStored(ctx, sessionId)
    assert.equal(eventsOf(stored, 'compaction/summary').length, 1)
    assert.equal(eventsOf(stored, 'compaction/end').length, 1)
    assert.match(JSON.stringify(stored), /Historical fixture facts/)
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})

test('native tool additions and removals project only the active set and preserve earlier call/result pairs', async t => {
  const { ctx, workspace, replies, requests } = await nativeHost(await isolated(t))
  const calls = []
  function register(name, deferLoading = false) {
    return ctx.tools.register(defineTool({
      name, description: name, parameters: {},
      ...(deferLoading ? { deferLoading: true } : {}),
      output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
      async execute(_args, exec) {
        calls.push([name, exec.callId])
        return name + ' result'
      },
    }))
  }
  function toolCall(body, description, id) {
    const [group] = body.tools
    const tool = group.tools.find(item => item.description === description)
    assert.ok(tool && !Object.hasOwn(tool, 'defer_loading'))
    return { type: 'function_call', namespace: group.name, name: tool.name, call_id: id, arguments: '{}' }
  }
  let handle
  let removedCall
  try {
    const remove = register('fixture.old', true)
    register('fixture.keep')
    replies.push(body => {
      removedCall = toolCall(body, 'fixture.old', 'call_old')
      const kept = toolCall(body, 'fixture.keep', 'call_keep')
      return sse(
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{' },
        { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: 'Between ' },
        { type: 'response.function_call_arguments.delta', output_index: 2, delta: '{}' },
        { type: 'response.output_text.delta', output_index: 1, content_index: 0, delta: 'tools.' },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '}' },
        { type: 'response.completed', response: { status: 'completed', output: [removedCall, assistant('Between tools.'), kept] } },
      )
    }, () => textResponse())
    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: route })
    const first = await followup(ctx, handle.agent, 'Call the two fixture tools.')
    assertTurnCompleted(first, 1)
    assert.deepEqual(calls, [['fixture.old', 'call_old'], ['fixture.keep', 'call_keep']])
    assert.ok(eventsOf(first, 'request/header').some(event =>
      event.data.header.tools?.some(tool => tool.name === 'fixture.old' && tool.deferLoading)))
    const wire = requests[1].input
    const oldIndex = wire.findIndex(item => item.type === 'function_call' && item.call_id === 'call_old')
    assert.deepEqual(wire.slice(oldIndex, oldIndex + 3).map(item => item.call_id ?? item.content),
      ['call_old', 'Between tools.', 'call_keep'])
    assert.deepEqual(wire.filter(item => item.type === 'function_call_output').map(item => item.call_id), ['call_old', 'call_keep'])

    remove()
    register('fixture.new', true)
    replies.push(body => completed(toolCall(body, 'fixture.new', 'call_new')), () => textResponse())
    const second = await followup(ctx, handle.agent, 'Use the current fixture tool.')
    assertTurnCompleted(second, 2)
    const changes = eventsOf(second, 'developer/message').flatMap(event => event.data.message.content)
    assert.ok(changes.some(block => block.type === 'tool-removal' && block.toolName === 'fixture.old'))
    assert.ok(changes.some(block => block.type === 'tool-addition' && block.toolName === 'fixture.new'))
    const next = requests[2]
    assert.ok(next.tools[0].tools.every(item => item.name !== removedCall.name))
    assert.ok(next.input.some(item => item.type === 'function_call' && item.call_id === 'call_old'))
    assert.ok(next.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_old'))
    assert.ok(requests[3].input.some(item => item.type === 'function_call_output' && item.call_id === 'call_new'))

    replies.push(() => completed({ ...removedCall, call_id: 'call_stale' }))
    const stale = await followup(ctx, handle.agent, 'Simulate a stale tool proposal.')
    assert.equal(eventsOf(stale, 'turn/end').at(-1).data.reason.error.code, 'INVALID_RESPONSE')
    assert.equal(eventsOf(stale, 'tool/call').length, 3)
    assert.deepEqual(calls, [['fixture.old', 'call_old'], ['fixture.keep', 'call_keep'], ['fixture.new', 'call_new']])
    assert.equal(requests.length, 5)
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})
