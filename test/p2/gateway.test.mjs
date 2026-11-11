import assert from 'node:assert/strict'
import { test } from 'node:test'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import Registry from '@deepseek-ai/dsh-typert-registry'
import { TYPERT } from '../../dist/typert.js'
import { canary, fixture, harness } from './fixtures.mjs'

test('published Typert loader and gateway accept the settings contract and enforce the owner boundary', async (t) => {
  const { dependencies } = fixture()
  const { ctx } = await harness(t, dependencies)
  const registry = ctx.plugin(Registry)
  const access = ctx.plugin(RemoteAccess)
  const gateway = ctx.plugin(Gateway)
  await Promise.all([registry, access, gateway])
  const dispose = ctx.typert.register(validateTypertManifest(TYPERT.package, TYPERT))
  const owner = new Peer(ctx, { principal: { kind: 'owner' } })
  const other = new Peer(ctx, { principal: { kind: 'fixture-viewer' } })
  t.after(async () => {
    await owner.dispose()
    await other.dispose()
    await dispose()
    await gateway.dispose()
    await access.dispose()
    await registry.dispose()
  })
  const send = (peer, action) => ctx.typertGateway.invoke({
    peer, namespace: 'chatgptSiwc', method: 'settings', args: { action },
  })
  await assert.rejects(() => send(other, { type: 'read' }), { code: 'remote-access/denied' })
  await assert.rejects(() => send(owner, { type: 'login', token: canary }))
  const result = await send(owner, { type: 'login' })
  assert.equal(result.ok, true)
  assert.ok(result.view.active)
  assert.equal(result.view.accounts.length, 1)
  const models = await send(owner, { type: 'reload' })
  assert.equal(models.view.models.length, 2)
  assert.doesNotMatch(JSON.stringify([result, models]), /synthetic-p2-sensitive-canary|fixture@sample|id_token|refresh_token|Bearer/)
})

test('the default Host view is offline and the sign-in command cannot contact an endpoint', async (t) => {
  const { ctx, accounts } = await harness(t)
  assert.deepEqual(await accounts.view(), {
    available: false, accounts: [], active: null, authorizing: false, confirmPlan: false, models: null,
  })
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Offline mode must not contact an endpoint'))
  await assert.rejects(accounts.login(), { code: 'offline' })
  assert.deepEqual(await ctx.llm.listModels('chatgpt-siwc'), [])
  assert.equal(globalThis.fetch.mock.callCount(), 0)
})
