import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { credentialKey, credentialKeyId } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import { allScopes, canary, clientId, endpoint, fixture, harness, issuer, resource, revoke } from './fixtures.mjs'

const accountRecordKey = (id) => credentialKey('chatgpt-siwc', 'account-' + id)

test('DSH authorization performs verified first login, reauthorization and native catalog publication', async (t) => {
  const { dependencies, state } = fixture()
  state.replay = true
  const { accounts, ctx } = await harness(t, dependencies)
  const events = []
  ctx.on('llm/models-updated', provider => { events.push(provider) })
  assert.deepEqual(await ctx.llm.listModels('chatgpt-siwc'), [])
  await accounts.login()
  const first = state.authorizationUrls[0]
  const form = state.requests.find(request => request.url === endpoint).form
  assert.equal(first.searchParams.get('client_id'), 'dynamic_agent_client')
  assert.equal(first.searchParams.get('agent_name_hint'), 'DSH ChatGPT SIWC')
  assert.match(first.searchParams.get('ext_agent_host_id'), /^urn:uuid:/)
  assert.equal(first.searchParams.get('scope'), allScopes)
  assert.equal(form.get('client_id'), clientId)
  assert.equal(form.get('resource'), resource)
  assert.equal(form.get('redirect_uri'), first.searchParams.get('redirect_uri'))
  assert.equal(first.searchParams.get('code_challenge'), createHash('sha256').update(form.get('code_verifier')).digest('base64url'))
  assert.equal(state.callbackStatus, 200)
  assert.equal(state.replayStatus, 410)
  await assert.rejects(fetch(state.callbackUrl))
  const before = await accounts.view()
  assert.equal(before.active, before.accounts[0].id)
  assert.equal(before.confirmPlan, true)
  await accounts.confirm()
  const catalog = await ctx.llm.listModels('chatgpt-siwc')
  assert.deepEqual(catalog.map(model => model.badge), catalog.map(() => ({
    text: { en: 'Using ChatGPT plan', zh: '正在使用 ChatGPT 订阅' }, tone: 'success',
  })))
  assert.deepEqual(catalog.map(({ id, name }) => ({ id, name })), [
    { id: 'fixture-z', name: 'Fixture Z' }, { id: 'fixture-a', name: 'Fixture A' },
  ])
  assert.equal((await ctx.llm.resolveModelInfo('chatgpt-siwc', 'fixture-z')).name, 'Fixture Z')
  assert.equal(state.requests.find(request => request.url === resource + '/models').headers.get('authorization').startsWith('Bearer '), true)
  assert.ok(events.includes('chatgpt-siwc'))
  const requests = state.requests.length
  await accounts.models()
  assert.equal(state.requests.length, requests)
  await accounts.login(before.active)
  const returning = state.authorizationUrls[1]
  assert.equal(returning.searchParams.get('client_id'), clientId)
  assert.equal(returning.searchParams.get('agent_name_hint'), null)
  assert.ok(returning.searchParams.get('id_token_hint'))
  assert.equal(returning.searchParams.get('ext_agent_host_id'), first.searchParams.get('ext_agent_host_id'))
  assert.notEqual(returning.searchParams.get('state'), first.searchParams.get('state'))
  const view = await accounts.view()
  assert.equal(view.confirmPlan, false)
  assert.equal(view.accounts.length, 1)
  assert.doesNotMatch(JSON.stringify(view), /synthetic-p2-sensitive-canary|fixture@sample|id_token|refresh|Bearer/)
})

test('exact model resolution uses only positive integer capacity from the active SIWC catalog', async (t) => {
  const { dependencies, state } = fixture()
  state.models[0].context_window = 500000
  state.models[2].context_window = '272000'
  state.models[2].max_context_window = 872000
  const { accounts, ctx } = await harness(t, dependencies)
  await accounts.login()

  const resolve = model => ctx.llm.resolveModelInfo('chatgpt-siwc', model)
  assert.deepEqual((await resolve('fixture-z')).context, { contextWindow: 500000 })
  const other = await resolve('fixture-a')
  assert.equal(other.name, 'Fixture A')
  assert.equal(other.context, undefined)
  assert.equal((await resolve('unknown')).context, undefined)
  assert.deepEqual((await accounts.view()).models, [
    { id: 'fixture-z', name: 'Fixture Z' }, { id: 'fixture-a', name: 'Fixture A' },
  ])
})

test('invalid ID claims, access resource, key source and issued IDs cannot commit credentials', async (t) => {
  for (const [label, setup, code] of [
    ['ID audience', state => { state.idClaims = { aud: 'dynamic_agent_client' } }, 'identity'],
    ['mixed ID audience', state => { state.idClaims = { aud: [clientId, 'oaiapp_other'] } }, 'identity'],
    ['nonce', state => { state.idClaims = { nonce: canary } }, 'identity'],
    ['issuer', state => { state.idClaims = { iss: resource } }, 'identity'],
    ['expiration', state => { state.idClaims = { exp: state.time / 1000 - 1 } }, 'identity'],
    ['access resource', state => { state.accessClaims = { aud: issuer } }, 'identity'],
    ['JWKS', state => { state.badJwks = true }, 'identity'],
    ['untrusted key origin', state => { state.jwksUri = 'https://example.invalid/jwks' }, 'identity'],
    ['invalid issued client', state => { state.clientId = 'dynamic_agent_client' }, 'callback'],
    ['callback denial', state => {
      state.callback = callback => callback.searchParams.set('error', 'access_denied')
    }, 'cancelled'],
  ]) {
    await t.test(label, async (child) => {
      const { state, dependencies } = fixture()
      setup(state)
      const { accounts, ctx } = await harness(child, dependencies)
      await assert.rejects(accounts.login(), error => error.code === code && !error.message.includes(canary))
      assert.deepEqual((await accounts.view()).accounts, [])
      assert.deepEqual(await ctx.llm.listModels('chatgpt-siwc'), [])
      await assert.rejects(fetch(state.callbackUrl))
    })
  }
})

test('the launcher URL stays opaque and hands off the authorization URL only once', async (t) => {
  const { dependencies } = fixture()
  const finishInFixture = dependencies.openBrowser
  let launch
  dependencies.openBrowser = async (authorization, signal, prepareHandoff) => {
    launch = prepareHandoff()
    assert.match(launch.href, /^http:\/\/127\.0\.0\.1:\d+\/auth\/start\/[a-f0-9]{64}$/)
    assert.equal(launch.origin, new URL(authorization.searchParams.get('redirect_uri')).origin)
    assert.equal((await fetch(launch, { method: 'HEAD', redirect: 'manual' })).status, 404)
    const invalid = await fetch(launch.href + '?destination=https://example.invalid', { redirect: 'manual' })
    assert.equal(invalid.status, 404)
    assert.equal(invalid.headers.get('location'), null)
    await invalid.body.cancel()
    const attempts = await Promise.all([fetch(launch, { redirect: 'manual' }), fetch(launch, { redirect: 'manual' })])
    assert.deepEqual(attempts.map(response => response.status).sort(), [303, 404])
    for (const response of attempts) {
      assert.equal(response.headers.get('location'), response.status === 303 ? authorization.href : null)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
      await response.body?.cancel()
    }
    await finishInFixture(authorization, signal, prepareHandoff)
  }
  const { accounts } = await harness(t, dependencies)
  await accounts.login()
  await assert.rejects(fetch(launch, { redirect: 'manual' }))
  const first = launch.href
  await accounts.login((await accounts.view()).active)
  assert.notEqual(launch.href, first)
  await assert.rejects(fetch(launch, { redirect: 'manual' }))
})

test('state mismatch, cancel, timeout and duplicate begin release a pending attempt', async (t) => {
  const { dependencies, state } = fixture()
  dependencies.loginTimeout = 450
  const { accounts } = await harness(t, dependencies)
  const { promise: opened, resolve } = Promise.withResolvers()
  const defaultOpen = dependencies.openBrowser
  let launch
  dependencies.openBrowser = async (...args) => {
    launch = args[2]()
    await defaultOpen(...args)
    resolve()
  }
  state.callback = callback => callback.searchParams.set('state', 'wrong')
  const pending = accounts.login()
  await opened
  assert.equal(state.callbackStatus, 400)
  await assert.rejects(accounts.login(), { code: 'busy' })
  accounts.cancel()
  await assert.rejects(pending, { code: 'cancelled' })
  assert.equal(state.requests.filter(request => request.url === endpoint).length, 0)
  await assert.rejects(fetch(state.callbackUrl))
  await assert.rejects(fetch(launch, { redirect: 'manual' }))
  await assert.rejects(accounts.login(), { code: 'timeout' })
  state.callback = undefined
  await accounts.login()
  assert.equal((await accounts.view()).accounts.length, 1)
})

test('identity-only and mismatched reauthorization cannot replace the active registration', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts } = await harness(t, dependencies)
  await accounts.login()
  const original = (await accounts.view()).active
  state.clientId = 'oaiapp_fixture_other'
  state.scope = 'openid profile email'
  await accounts.login()
  assert.equal((await accounts.view()).active, original)
  assert.ok((await accounts.view()).accounts.some(entry => entry.status === 'identityOnly'))
  state.scope = allScopes
  state.account = 'different-subject'
  await assert.rejects(accounts.login(original), { code: 'identity' })
  state.callback = callback => callback.searchParams.set('client_id', state.clientId)
  await assert.rejects(accounts.login(original), { code: 'callback' })
  assert.equal((await accounts.view()).active, original)
})

test('a failed first code exchange retries with the issued client and a new transaction', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts } = await harness(t, dependencies)
  state.exchangeError = 'invalid_grant'
  await assert.rejects(accounts.login(), { code: 'reauthorize' })
  assert.deepEqual((await accounts.view()).accounts, [])
  state.exchangeError = undefined
  await accounts.login()
  const [first, retry] = state.authorizationUrls
  assert.equal(retry.searchParams.get('client_id'), clientId)
  assert.equal(retry.searchParams.has('agent_name_hint'), false)
  assert.notEqual(retry.searchParams.get('state'), first.searchParams.get('state'))
})

test('catalog invalidation rejects stale results and distinguishes quota, permission and rate limit', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts } = await harness(t, dependencies)
  await accounts.login()
  const original = (await accounts.view()).active
  await accounts.models()
  state.clientId = 'oaiapp_second'
  await accounts.login()
  const second = (await accounts.view()).active
  assert.notEqual(second, original)
  assert.equal((await accounts.view()).models, null)

  const { promise: started, resolve: start } = Promise.withResolvers()
  const { promise: done, resolve: finish } = Promise.withResolvers()
  state.modelResponse = async () => { start(); return done }
  const stale = accounts.models()
  await started
  await accounts.activate(original)
  finish(Response.json({ models: state.models }))
  await assert.rejects(stale, { code: 'cancelled' })
  assert.equal((await accounts.view()).models, null)

  for (const [status, remoteCode, expected] of [
    [401, 'bad_token', 'reauthorize'], [403, 'scope', 'permission'], [429, 'too_fast', 'rateLimit'],
    [429, 'subscription_sharing_usage_limit_exceeded', 'quota'],
  ]) {
    state.modelResponse = () => Response.json({ error: { code: remoteCode, message: canary } }, { status })
    await assert.rejects(accounts.models(true), error => error.code === expected && !error.message.includes(canary))
  }
  state.modelResponse = undefined
  state.models = []
  assert.deepEqual(await accounts.models(), [])
  assert.deepEqual((await accounts.view()).models, [])
  const prior = state.requests.length
  state.time += 61_000
  await accounts.models()
  assert.equal(state.requests.length, prior + 1)
})

test('expired credentials rotate once and sign-out clears tokens even if revocation is unconfirmed', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts, ctx } = await harness(t, dependencies)
  await accounts.login()
  const id = (await accounts.view()).active
  state.time += 301_000
  await Promise.all([accounts.models(), accounts.models()])
  const refreshes = state.requests.filter(({ form }) => form?.get('grant_type') === 'refresh_token')
  assert.equal(refreshes.length, 1)
  assert.equal(refreshes[0].form.get('refresh_token'), canary)
  assert.equal(refreshes[0].form.has('scope'), false)
  assert.equal(refreshes[0].form.get('client_id'), clientId)

  state.revokeStatus = 503
  assert.equal(await accounts.logout(id), 'unconfirmed')
  assert.equal(state.requests.filter(request => request.url === revoke).length, 2)
  const record = (await ctx.credentials.readRecord(accountRecordKey(id))).payload
  assert.equal(record.status, 'signedOut')
  assert.equal(record.identity.clientId, clientId)
  assert.doesNotMatch(JSON.stringify(record), /synthetic-p2-sensitive-canary|tokens/)
  assert.equal((await accounts.view()).active, null)
  assert.deepEqual(await ctx.llm.listModels('chatgpt-siwc'), [])

  await accounts.login(id)
  assert.equal(await accounts.logout(id), 'unconfirmed')
  state.revokeStatus = 200
  await accounts.login(id)
  assert.equal(await accounts.logout(id), 'confirmed')
})

test('invalid stored schema and failed rotation preserve other credential owners', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts, ctx } = await harness(t, dependencies)
  await accounts.login()
  const id = (await accounts.view()).active
  const foreign = credentialKey('other-plugin', 'account-' + randomUUID())
  const protectedRecord = { kind: 'grant', payload: { canary } }
  await ctx.credentials.modifyRecord(foreign, async () => protectedRecord)
  state.time += 301_000
  state.refreshError = 'invalid_grant'
  await assert.rejects(accounts.models(), { code: 'reauthorize' })
  assert.equal((await accounts.view()).accounts[0].status, 'reauthorize')
  assert.equal((await ctx.credentials.readRecord(accountRecordKey(id))).payload.tokens, undefined)
  assert.deepEqual(await ctx.credentials.readRecord(foreign), protectedRecord)
  await ctx.credentials.modifyRecord(accountRecordKey(id), async () => ({ kind: 'grant', payload: { version: 9, canary } }))
  await assert.rejects(accounts.view(), error => error.code === 'storage' && !error.message.includes(canary))
  assert.ok((await ctx.credentials.listRecords()).some(({ key }) => credentialKeyId(key) === 'account-' + id))
})

test('a failed write after rotation cannot expose the uncommitted token or retry it in this process', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts, ctx } = await harness(t, dependencies)
  await accounts.login()
  const id = (await accounts.view()).active
  state.time += 301_000
  const original = LocalCredentials.prototype.modifyRecord
  t.mock.method(LocalCredentials.prototype, 'modifyRecord', async function (key, mutate) {
    return original.call(this, key, async (current) => {
      const next = await mutate(current)
      if (next?.payload?.tokens?.refresh === canary + '-rotated') throw new Error(canary)
      return next
    })
  })
  await assert.rejects(accounts.models(), error => error.code === 'storage' && !error.message.includes(canary))
  await assert.rejects(accounts.models(), { code: 'reauthorize' })
  assert.equal((await accounts.view()).accounts[0].status, 'reauthorize')
  assert.equal((await ctx.credentials.readRecord(accountRecordKey(id))).payload.tokens.refresh, canary)
  assert.equal(state.requests.filter(({ form }) => form?.get('grant_type') === 'refresh_token').length, 1)
  assert.equal(state.requests.filter(request => request.url === resource + '/models').length, 0)
  assert.equal(await accounts.logout(id), 'unconfirmed')
})
