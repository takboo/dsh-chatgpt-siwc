import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { assertTurnCompleted, completed, eventsOf, followup, nativeHost, opaqueReasoning, readStored, route, textResponse, writeCall } from './native-host.mjs'

const { ctx, workspace, requests, replies } = await nativeHost(process.argv[2])
const id = SessionId('p3-native-source')
const marker = join(workspace, 'approved.txt')
let handle
try {
  let writes = 0
  ctx.on('fs/observed', (_target, observation, execution) => {
    if (observation.kind === 'present' && execution.callId === 'call_approved') writes++
  })
  ctx.on('approval/request', async ({ agent, toolName, callId }) => {
    assert.equal(toolName, 'write')
    assert.equal(callId, 'call_approved')
    assert.equal(writes, 0)
    await assert.rejects(readFile(marker), { code: 'ENOENT' })
    assert.equal(eventsOf(agent.session.snapshotEvents(), 'approval/asked').length, 1)
    return 'allowed-once'
  })
  handle = await ctx.agents.create({ sessionId: id, meta: { cwd: workspace }, agentOptions: route })
  replies.push(
    body => completed(opaqueReasoning, writeCall(body, 'call_approved', 'approved.txt', true)),
    () => Response.json({ error: { message: 'Synthetic 503 after committed tool result.' } }, { status: 503 }),
    () => {
      const events = handle.agent.session.snapshotEvents()
      assert.equal(eventsOf(events, 'tool/result').length, 1)
      assert.equal(eventsOf(events, 'llm/retry').length, 1)
      assert.equal(eventsOf(events, 'llm/retry-started').length, 1)
      assert.equal(writes, 1)
      return textResponse()
    },
  )
  const events = await followup(ctx, handle.agent, 'Write the fixture marker.')
  assertTurnCompleted(events, 1)
  assert.equal(writes, 1)
  assert.equal(await readFile(marker, 'utf8'), 'native fixture\n')
  assert.equal(replies.length, 0)
  assert.equal(requests.length, 3)
  assert.deepEqual(requests[1], requests[2])
  const [asked] = eventsOf(events, 'approval/asked')
  assert.deepEqual(eventsOf(events, 'approval/decided').map(event => event.data), [
    { id: asked.data.id, outcome: 'allowed-once' },
  ])
  assert.equal(eventsOf(events, 'tool/call').length, 1)
  const [result] = eventsOf(events, 'tool/result')
  assert.equal(result.data.message.isError, false)
  const [retry] = eventsOf(events, 'llm/retry')
  const [started] = eventsOf(events, 'llm/retry-started')
  assert.equal(retry.data.failure.code, 'SERVER')
  assert.equal(started.data.retryId, retry.data.retryId)
  assert.equal(started.data.step, retry.data.step)
  assert.ok(asked.seq < result.seq && result.seq < retry.seq && retry.seq < started.seq)
  const [output] = requests[1].input.filter(item => item.type === 'function_call_output')
  assert.equal(output.call_id, 'call_approved')
  assert.match(output.output, /Created file/)
  assert.ok(requests[1].input.some(item => item.encrypted_content === opaqueReasoning.encrypted_content))
  await handle.dispose()
  handle = undefined
  assert.deepEqual(await readStored(ctx, id), events)
  console.log(JSON.stringify({ outcome: 'allowed-once', writes, attempts: requests.length, retries: 1 }))
} finally {
  await handle?.dispose()
  await ctx.fiber.dispose()
}
