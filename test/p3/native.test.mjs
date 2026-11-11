import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { sse } from '../p0/sse.mjs'
import { canary } from '../p2/fixtures.mjs'
import { assertTurnCompleted, completed, eventsOf, followup, isolated, nativeHost, opaqueReasoning, readStored, route, textResponse, writeCall } from './native-host.mjs'

test('DSH native approval allows one write, retries the next request durably, and resumes and forks from disk', async t => {
  const directory = await isolated(t)
  const seed = fileURLToPath(new URL('./native-seed.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [seed, directory], { timeout: 10_000 })
  assert.deepEqual(JSON.parse(stdout), { outcome: 'allowed-once', writes: 1, attempts: 3, retries: 1 })
  const { ctx, workspace, requests, replies } = await nativeHost(directory, { signIn: false })
  const id = SessionId('p3-native-source')
  try {
    const stored = await readStored(ctx, id)
    assert.doesNotMatch(JSON.stringify(stored), new RegExp(canary + '|Bearer ey'))
    assert.equal(eventsOf(stored, 'tool/call').length, 1)
    assertTurnCompleted(stored, 1)
    let approvals = 0
    let mutations = 0
    ctx.on('approval/request', async () => { approvals++; return 'rejected' })
    ctx.on('fs/observed', () => { mutations++ })
    const forkId = SessionId('p3-native-fork')
    const verifyContinuation = async (handle, sessionId, nextText) => {
      try {
        const prior = requests.length
        replies.push(() => textResponse())
        const events = await followup(ctx, handle.agent, nextText)
        assertTurnCompleted(events, 2)
        assert.equal(requests.length, prior + 1)
        const wire = requests[prior].input
        const call = wire.findIndex(item => item.type === 'function_call' && item.call_id === 'call_approved')
        const result = wire.findIndex(item => item.type === 'function_call_output' && item.call_id === 'call_approved')
        const next = wire.findIndex(item => item.role === 'user' && item.content === nextText)
        assert.ok(call > 0 && call < result && result < next)
        assert.deepEqual(wire[call - 1], opaqueReasoning)
        assert.match(wire[result].output, /Created file/)
        assert.equal(wire.filter(item => item.type === 'function_call_output').length, 1)
        assert.equal(eventsOf(events, 'tool/call').length, 1)
      } finally {
        await handle.dispose()
      }
      const after = await readStored(ctx, sessionId)
      assert.deepEqual(after.slice(0, stored.length), stored)
      assertTurnCompleted(after, 2)
    }
    const resumed = await ctx.agents.resume({ resumeSessionId: id })
    await verifyContinuation(resumed, id, 'Continue the restored turn.')
    const fork = await ctx.agents.create({
      sessionId: forkId, seed: stored, inheritedEventCount: SessionLogOffset(stored.length),
      meta: { cwd: workspace, parentSession: id, isSeeded: true }, agentOptions: route,
    })
    assert.equal(fork.agent.session.header.parentSession, id)
    await verifyContinuation(fork, forkId, 'Continue in the fork.')
    assert.equal(approvals, 0)
    assert.equal(mutations, 0)
    assert.equal(await readFile(join(workspace, 'approved.txt'), 'utf8'), 'native fixture\n')
  } finally {
    await ctx.fiber.dispose()
  }
})

test('DSH approval rejection and the standing read-only filesystem sandbox both prevent writes', async t => {
  const cases = [
    { name: 'explicit user rejection', escalate: true, approvals: 1, reason: /user rejected escalating/ },
    { name: 'standing sandbox denial', escalate: false, approvals: 0, reason: /sandbox: file access denied under read-only mode/ },
  ]
  for (const { name, escalate, approvals, reason } of cases) {
    await t.test(name, async st => {
      const { ctx, workspace, replies, requests } = await nativeHost(await isolated(st))
      let handle
      try {
        const marker = join(workspace, 'refused.txt')
        let asks = 0
        let mutations = 0
        ctx.on('fs/observed', () => { mutations++ })
        ctx.on('approval/request', async ({ toolName, callId }) => {
          asks++
          assert.equal(toolName, 'write')
          assert.equal(callId, 'call_refused')
          await assert.rejects(readFile(marker), { code: 'ENOENT' })
          return 'rejected'
        })
        replies.push(body => completed(writeCall(body, 'call_refused', 'refused.txt', escalate)), () => textResponse())
        handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: route })
        const events = await followup(ctx, handle.agent, 'Try writing the fixture marker.')
        assertTurnCompleted(events, 1)
        assert.equal(asks, approvals)
        assert.equal(mutations, 0)
        assert.equal(requests.length, 2)
        assert.equal(eventsOf(events, 'tool/call').length, 1)
        const [result] = eventsOf(events, 'tool/result')
        assert.equal(result.data.message.isError, true)
        if (!escalate) assert.equal(result.data.error.code, 'FS_SANDBOX_DENIED')
        assert.deepEqual(eventsOf(events, 'approval/decided').map(event => event.data.outcome), escalate ? ['rejected'] : [])
        const [output] = requests[1].input.filter(item => item.type === 'function_call_output')
        assert.equal(output.call_id, 'call_refused')
        assert.match(output.output, reason)
        await assert.rejects(readFile(marker), { code: 'ENOENT' })
      } finally {
        await handle?.dispose()
        await ctx.fiber.dispose()
      }
    })
  }
})

test('DSH retries a failed stream with a proposed tool, while quota ends the turn without retry', async t => {
  const { ctx, workspace, replies, requests } = await nativeHost(await isolated(t))
  let handle
  try {
    let asks = 0
    ctx.on('approval/request', async () => { asks++; return 'rejected' })
    replies.push(body => sse({
      type: 'response.output_item.done', output_index: 0,
      item: writeCall(body, 'call_interrupted', 'interrupted.txt', true),
    }), () => textResponse())
    handle = await ctx.agents.create({ meta: { cwd: workspace }, agentOptions: route })
    const recovered = await followup(ctx, handle.agent, 'Run a synthetic interrupted turn.')
    assertTurnCompleted(recovered, 1)
    assert.equal(eventsOf(recovered, 'llm/retry').length, 1)
    assert.equal(eventsOf(recovered, 'tool/call').length, 0)
    assert.deepEqual(requests[0], requests[1])
    assert.equal(asks, 0)
    await assert.rejects(readFile(join(workspace, 'interrupted.txt')), { code: 'ENOENT' })

    replies.push(() => sse({
      type: 'response.failed',
      response: { status: 'failed', error: { code: 'subscription_sharing_usage_limit_exceeded' } },
    }))
    const quota = await followup(ctx, handle.agent, 'Run a synthetic limited turn.')
    assert.equal(eventsOf(quota, 'turn/end').at(-1).data.reason.error.code, 'QUOTA')
    assert.equal(eventsOf(quota, 'llm/retry').length, 1)
    assert.equal(requests.length, 3)
  } finally {
    await handle?.dispose()
    await ctx.fiber.dispose()
  }
})
