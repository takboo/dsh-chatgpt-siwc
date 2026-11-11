import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Authorization from '@deepseek-ai/dsh-authorization'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import FsSandbox from '@deepseek-ai/dsh-fs-sandbox'
import Llm, { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmRetry from '@deepseek-ai/dsh-llm-retry'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SessionStore from '@deepseek-ai/dsh-session'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import Tools from '@deepseek-ai/dsh-tools'
import UserApproval from '@deepseek-ai/dsh-user-approval'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { sse, usage } from '../p0/sse.mjs'
import { fixture, resource } from '../p2/fixtures.mjs'

export const route = { provider: 'chatgpt-siwc', model: 'fixture-z' }
export const opaqueReasoning = {
  type: 'reasoning', id: 'rs_native_fixture', summary: [], encrypted_content: 'opaque-native-fixture',
}

export const completed = (...output) => sse({
  type: 'response.completed', response: { status: 'completed', output, usage },
})

export const textResponse = (text = 'Fixture turn finished.') => completed({
  type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }],
})

export function writeCall(body, id, file, escalate) {
  assert.equal(body.tools.length, 1)
  const [namespace] = body.tools
  assert.equal(namespace.tools.length, 1)
  const [tool] = namespace.tools
  assert.equal(tool.type, 'function')
  assert.match(tool.description, /UTF-8/)
  assert.ok(tool.parameters.properties.sandbox_permissions.enum.includes('workspace-write'))
  return {
    type: 'function_call', namespace: namespace.name, name: tool.name, call_id: id,
    arguments: JSON.stringify({
      file_path: file, content: 'native fixture\n',
      ...(escalate ? { sandbox_permissions: 'workspace-write', justification: 'Write the isolated fixture marker.' } : {}),
    }),
  }
}

export async function isolated(t) {
  const path = await mkdtemp(join(tmpdir(), 'siwc-p3-native-'))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

export async function nativeHost(directory, { signIn = true } = {}) {
  const dshHome = join(directory, 'dsh')
  const workspace = join(directory, 'workspace')
  await mkdir(dshHome, { recursive: true })
  await mkdir(workspace, { recursive: true })
  const ctx = new Context()
  const { dependencies, state } = fixture()
  const fetch = dependencies.fetch
  const requests = []
  const replies = []
  dependencies.fetch = async (input, init) => {
    if (String(input) !== resource + '/responses') return fetch(input, init)
    const request = new Request(input, init)
    const body = await request.json()
    requests.push(body)
    const reply = replies.shift()
    assert.ok(reply, 'Unexpected inference attempt')
    return reply(body, request)
  }
  try {
    await ctx.plugin(Llm)
    await ctx.plugin(LocalCredentials, { path: join(dshHome, 'credentials.yaml'), watch: false })
    await ctx.plugin(Authorization)
    await ctx.plugin(Loader, { baseUrl: import.meta.url })
    const binding = { dependencies }
    ctx.provide('siwcFixture', binding)
    const row = { id: route.provider, name: new URL('./native-plugin.mjs', import.meta.url).href }
    async function setEnabled(enabled) {
      await ctx.loader.root.update(enabled ? [row] : [])
      await ctx.loader.await()
    }
    await setEnabled(true)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjections)
    await ctx.plugin(SystemPrompt, { personaPrefix: '' })
    await ctx.plugin(Tools)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SandboxPolicy, { workspaceRoot: workspace, mode: 'read-only' })
    await ctx.plugin(FsSandbox, { cwd: workspace })
    await ctx.plugin(WorkingDirectory, { defaultDirectory: workspace })
    await ctx.plugin(UserApproval, { policy: 'ask' })
    await ctx.plugin(ToolFs, { read: false, readImage: false, edit: false })
    await ctx.plugin(JsonlPersistence, { root: join(dshHome, 'sessions'), compression: 'none' })
    await ctx.plugin(LlmRetry)
    await ctx.plugin(AgentLoop, { agents: [] })
    if (signIn) await binding.accounts.login()
    return { ctx, workspace, requests, replies, state, setEnabled }
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

export async function followup(ctx, agent, text) {
  const idle = Promise.withResolvers()
  const dispose = ctx.on('agent/status', ({ agent: current, status }) => {
    if (current === agent && status === 'idle') idle.resolve()
  })
  try {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await idle.promise
    return agent.session.snapshotEvents()
  } finally {
    dispose()
  }
}

export async function readStored(ctx, id) {
  const handle = await ctx.sessionPersistence.open(id, 'read')
  try {
    return (await handle.read()).events
  } finally {
    await handle.close()
  }
}

export const eventsOf = (events, type) => events.filter(event => event.type === type)

export function assertTurnCompleted(events, turn) {
  const end = eventsOf(events, 'turn/end').at(-1)
  assert.equal(end?.data.turn, turn)
  assert.deepEqual(end.data.reason, { kind: 'completed' })
}
