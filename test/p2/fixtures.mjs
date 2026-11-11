import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Authorization from '@deepseek-ai/dsh-authorization'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import Llm from '@deepseek-ai/dsh-llm'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { attachAccounts } from '../../dist/index.js'

export const issuer = 'https://auth.openai.com'
export const resource = 'https://api.openai.com/v1'
export const authorize = issuer + '/api/accounts/authorize'
export const endpoint = issuer + '/api/accounts/oauth/token'
export const revoke = issuer + '/api/accounts/oauth/revoke'
export const allScopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
export const canary = 'synthetic-p2-sensitive-canary'
export const clientId = 'oaiapp_fixture'
const webFetch = globalThis.fetch
const keys = await generateKeyPair('RS256', { extractable: true })
const publicJwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256' }
const baseTime = Math.floor(Date.now() / 1000) * 1000

export function fixture() {
  const state = {
    time: baseTime, requests: [], authorizationUrls: [], account: 'fixture-account', clientId,
    models: [
      { slug: 'fixture-z', display_name: 'Fixture Z', visibility: 'list', extra: 'ignored' },
      { slug: 'fixture-hidden', display_name: 'Hidden', visibility: 'hidden' },
      { slug: 'fixture-a', display_name: 'Fixture A', visibility: 'list' },
      { slug: 'fixture-z', display_name: 'Duplicate', visibility: 'list' },
    ],
    scope: allScopes,
  }
  const sign = async (audience, extra) => new SignJWT({
    iss: issuer, sub: state.account, aud: audience, iat: state.time / 1000,
    exp: state.time / 1000 + 300, ...extra,
  }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(keys.privateKey)
  const dependencies = {
    now: () => state.time,
    loginTimeout: 2000,
    async openBrowser(input) {
      assert.equal(input.origin + input.pathname, authorize)
      state.authorizationUrls.push(new URL(input))
      const callback = new URL(input.searchParams.get('redirect_uri'))
      assert.equal(callback.hostname, '127.0.0.1')
      assert.equal(callback.pathname, '/auth/callback')
      callback.searchParams.set('state', input.searchParams.get('state'))
      callback.searchParams.set('code', canary)
      if (input.searchParams.get('client_id') === 'dynamic_agent_client') {
        callback.searchParams.set('client_id', state.clientId)
      }
      if (state.callback) await state.callback(callback, input)
      const response = await webFetch(callback)
      state.callbackUrl = callback
      state.callbackStatus = response.status
      assert.doesNotMatch(await response.text(), /synthetic-p2-sensitive-canary/)
      if (state.replay) {
        const replay = await webFetch(callback)
        state.replayStatus = replay.status
        await replay.body?.cancel()
      }
    },
    async fetch(input, init) {
      const url = new URL(input)
      assert.equal(init.redirect, 'error')
      assert.ok(init.signal instanceof AbortSignal)
      const form = init.body ? new URLSearchParams(init.body) : undefined
      state.requests.push({ url: url.href, form, headers: new Headers(init.headers) })
      if (url.href === issuer + '/.well-known/openid-configuration') return Response.json({
        issuer, authorization_endpoint: authorize, token_endpoint: endpoint,
        jwks_uri: state.jwksUri ?? issuer + '/.well-known/jwks.json', revocation_endpoint: revoke,
      })
      if (url.href === issuer + '/.well-known/jwks.json') {
        return Response.json({ keys: state.badJwks ? [] : [publicJwk] })
      }
      if (url.href === endpoint) {
        const refresh = form.get('grant_type') === 'refresh_token'
        const issued = form.get('client_id')
        if (refresh && state.refreshDelay) await state.refreshDelay(init.signal)
        if (refresh && state.refreshError) return Response.json({ error: state.refreshError }, { status: 400 })
        if (!refresh && state.exchangeError) return Response.json({ error: state.exchangeError }, { status: 400 })
        return Response.json({
          id_token: refresh ? undefined : await sign(issued, {
            nonce: state.authorizationUrls.at(-1).searchParams.get('nonce'),
            email: 'fixture@sample.invalid', email_verified: true, ...state.idClaims,
          }),
          access_token: await sign(resource, {
            client_id: issued, scope: state.scope, ...state.accessClaims,
          }),
          refresh_token: refresh ? canary + '-rotated' : canary,
          scope: state.scope,
          token_type: 'Bearer',
          expires_in: 300,
        })
      }
      if (url.href === revoke) return new Response(null, { status: state.revokeStatus ?? 200 })
      if (url.href === resource + '/models') {
        if (state.modelResponse) return state.modelResponse(init.signal)
        return Response.json({ models: state.models })
      }
      assert.fail('Fixture request went outside the verified endpoint set')
    },
  }
  return { dependencies, state }
}

export async function harness(t, dependencies, backingPath) {
  const directory = backingPath ? undefined : await mkdtemp(join(tmpdir(), 'siwc-p2-'))
  const path = backingPath ?? join(directory, 'credentials.yaml')
  const ctx = new Context()
  const base = [
    ctx.plugin(Llm),
    ctx.plugin(LocalCredentials, { path, watch: false }),
    ctx.plugin(Authorization),
  ]
  t.after(async () => {
    for (const fiber of base.reverse()) await fiber.dispose()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  await Promise.all(base)
  let accounts
  const plugin = ctx.plugin({
    inject: ['llm', 'authorization', 'credentials'],
    apply(child) { accounts = attachAccounts(child, dependencies) },
  })
  base.push(plugin)
  await plugin
  return { ctx, accounts, path, plugin }
}
