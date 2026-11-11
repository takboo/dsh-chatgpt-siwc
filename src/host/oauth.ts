import { createHash, randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createLocalJWKSet, jwtVerify } from 'jose'
import type { JSONWebKeySet, JWTPayload } from 'jose'
import { z } from 'zod'
import { listenForCallback } from './loopback.js'

const issuer = 'https://auth.openai.com'
export const resource = 'https://api.openai.com/v1'
const authorizeEndpoint = issuer + '/api/accounts/authorize'
const tokenEndpoint = issuer + '/api/accounts/oauth/token'
const entryClient = 'dynamic_agent_client'
const scopes = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const direct = 'chatgpt.tokens.use.direct'

export type FaultCode = 'offline' | 'cancelled' | 'timeout' | 'callback' | 'identity'
  | 'configuration' | 'temporary' | 'reauthorize' | 'stale' | 'busy' | 'storage'
  | 'permission' | 'quota' | 'rateLimit' | 'catalog'

export class SiwcFault extends Error {
  constructor(readonly code: FaultCode) {
    super(`ChatGPT account operation: ${code}`)
  }
}

export class RetryRegistration extends SiwcFault {
  constructor(readonly clientId: string) {
    super('reauthorize')
  }
}

export const identitySchema = z.object({
  clientId: z.string().regex(/^oaiapp_[a-zA-Z0-9_-]{1,200}$/),
  subject: z.string().min(1).max(512),
  label: z.string().min(1).max(100).optional(),
})
export const tokenSchema = z.object({
  access: z.string().min(1).max(32_768),
  refresh: z.string().min(1).max(32_768).optional(),
  idToken: z.string().min(1).max(32_768),
  scopes: z.array(z.string()),
  expiresAt: z.number().finite().positive(),
  refreshAt: z.number().finite().nonnegative().optional(),
})
export type Identity = z.infer<typeof identitySchema>
export type Tokens = z.infer<typeof tokenSchema>

const wireTokens = z.object({
  access_token: tokenSchema.shape.access,
  refresh_token: tokenSchema.shape.refresh,
  id_token: tokenSchema.shape.idToken.optional(),
  token_type: z.string().refine(value => value.toLowerCase() === 'bearer'),
  scope: z.string().max(4096).optional(),
  expires_in: z.number().int().positive().max(86400),
  earliest_refresh_at: z.number().nonnegative().finite().optional(),
})

const discoverySchema = z.object({
  issuer: z.literal(issuer),
  authorization_endpoint: z.literal(authorizeEndpoint),
  token_endpoint: z.literal(tokenEndpoint),
  jwks_uri: z.string(),
  revocation_endpoint: z.string(),
})

const terminalRefresh = new Set([
  'invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired',
  'refresh_token_invalidated', 'refresh_token_reused',
])

export function hasPlan(tokens: Tokens): boolean {
  return tokens.scopes.includes(direct) && tokens.scopes.includes('resource.invoke')
}

function opaque(): string {
  return randomBytes(32).toString('base64url')
}

function authUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new SiwcFault('identity')
  }
  if (url.origin !== issuer || url.username || url.password || url.hash || url.search) {
    throw new SiwcFault('identity')
  }
  return url
}

export async function readJson(response: Response, code: FaultCode): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new SiwcFault(code)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let json = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(json + decoder.decode()) as unknown
      size += value.byteLength
      if (size > 1_048_576) throw new SiwcFault(code)
      json += decoder.decode(value, { stream: true })
    }
  } catch {
    throw new SiwcFault(code)
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export interface OAuthDependencies {
  fetch: typeof fetch
  openBrowser(url: URL, signal: AbortSignal): Promise<void>
  now?: () => number
  loginTimeout?: number
}

export class OAuth {
  readonly now: () => number

  constructor(private readonly deps: OAuthDependencies) {
    this.now = deps.now ?? Date.now
  }

  async request(url: URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(8_000)])
    try {
      const response = await this.deps.fetch(url, { ...init, redirect: 'error', signal: deadline })
      deadline.throwIfAborted()
      if (response.redirected || (response.url && response.url !== url.href)) {
        await response.body?.cancel().catch(() => {})
        throw new SiwcFault('configuration')
      }
      return response
    } catch (error) {
      if (error instanceof SiwcFault) throw error
      throw new SiwcFault(signal.aborted ? 'cancelled' : deadline.aborted ? 'timeout' : 'temporary')
    }
  }

  private async discovery(signal: AbortSignal) {
    const response = await this.request(new URL(issuer + '/.well-known/openid-configuration'), {}, signal)
    const config = discoverySchema.safeParse(await readJson(response, 'identity'))
    if (!response.ok || !config.success) throw new SiwcFault('identity')
    return {
      jwks: authUrl(config.data.jwks_uri),
      revocation: authUrl(config.data.revocation_endpoint),
    }
  }

  private async keys(signal: AbortSignal) {
    const { jwks } = await this.discovery(signal)
    const response = await this.request(jwks, {}, signal)
    const json = await readJson(response, 'identity')
    const keys = z.object({ keys: z.array(z.record(z.string(), z.unknown())).min(1).max(32) }).safeParse(json)
    if (!response.ok || !keys.success) throw new SiwcFault('identity')
    return createLocalJWKSet(keys.data as JSONWebKeySet)
  }

  private async claims(
    jwt: string, audience: string, keys: ReturnType<typeof createLocalJWKSet>,
  ): Promise<JWTPayload & { sub: string; exp: number }> {
    try {
      const { payload } = await jwtVerify(jwt, keys, {
        issuer,
        audience,
        algorithms: ['RS256'],
        currentDate: new Date(this.now()),
        requiredClaims: ['exp', 'iat', 'sub'],
        maxTokenAge: '24h',
      })
      const exactAudience = payload.aud === audience ||
        (Array.isArray(payload.aud) && payload.aud.length === 1 && payload.aud[0] === audience)
      if (!exactAudience || !payload.sub || payload.sub.length > 512 || payload.exp === undefined) {
        throw new SiwcFault('identity')
      }
      return { ...payload, sub: payload.sub, exp: payload.exp }
    } catch {
      throw new SiwcFault('identity')
    }
  }

  private async exchange(form: URLSearchParams, signal: AbortSignal) {
    const response = await this.request(new URL(tokenEndpoint), { method: 'POST', body: form }, signal)
    const body = await readJson(response, response.status >= 500 ? 'temporary' : 'identity')
    if (!response.ok) {
      const { data } = z.object({ error: z.string() }).safeParse(body)
      if (data?.error === 'invalid_client') throw new SiwcFault('configuration')
      if (data && terminalRefresh.has(data.error)) throw new SiwcFault('reauthorize')
      throw new SiwcFault(response.status >= 500 ? 'temporary' : 'identity')
    }
    const parsed = wireTokens.safeParse(body)
    if (!parsed.success) throw new SiwcFault('identity')
    return parsed.data
  }

  private async tokens(
    wire: z.infer<typeof wireTokens>, identity: Identity, keys: ReturnType<typeof createLocalJWKSet>,
    retained?: Tokens,
  ): Promise<Tokens> {
    const idToken = wire.id_token ?? retained?.idToken
    const granted = wire.scope === undefined ? retained?.scopes : wire.scope.split(/\s+/).filter(Boolean)
    if (!idToken || !granted || (retained?.refresh && !wire.refresh_token)) throw new SiwcFault('identity')
    if (granted.includes('offline_access') && !wire.refresh_token) throw new SiwcFault('identity')
    const token: Tokens = {
      access: wire.access_token,
      idToken,
      scopes: granted,
      expiresAt: this.now() + wire.expires_in * 1000,
      ...(wire.refresh_token ? { refresh: wire.refresh_token } : {}),
      ...(wire.earliest_refresh_at === undefined ? {} : { refreshAt: wire.earliest_refresh_at * 1000 }),
    }
    if (hasPlan(token)) {
      const access = await this.claims(token.access, resource, keys)
      const accessScopes = typeof access.scope === 'string' ? access.scope.split(/\s+/) : []
      if (
        access.sub !== identity.subject || access.client_id !== identity.clientId
        || !granted.every(scope => accessScopes.includes(scope))
      ) throw new SiwcFault('identity')
      token.expiresAt = Math.min(token.expiresAt, access.exp * 1000)
    }
    return token
  }

  async login(
    host: string, signal: AbortSignal, previous?: { identity: Identity; tokens?: Tokens }, retryClient?: string,
  ) {
    const deadline = AbortSignal.timeout(this.deps.loginTimeout ?? 180_000)
    const finished = new AbortController()
    const attempt = AbortSignal.any([signal, deadline, finished.signal])
    const issued = previous?.identity.clientId ?? retryClient
    const state = opaque()
    const nonce = opaque()
    const verifier = opaque()
    try {
      const callback = await listenForCallback(state, issued, attempt)
      const url = new URL(authorizeEndpoint)
      url.search = new URLSearchParams({
        client_id: issued ?? entryClient,
        ext_agent_host_id: host,
        response_type: 'code',
        redirect_uri: callback.redirect,
        scope: scopes,
        resource,
        state,
        nonce,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString()
      if (!issued) url.searchParams.set('agent_name_hint', 'DSH ChatGPT SIWC')
      if (previous?.tokens) url.searchParams.set('id_token_hint', previous.tokens.idToken)
      try {
        const [result] = await Promise.all([callback.result, this.deps.openBrowser(url, attempt)])
        const form = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: result.clientId,
          code: result.code,
          code_verifier: verifier,
          redirect_uri: callback.redirect,
          resource,
        })
        const exchange = this.exchange(form, attempt).catch((error: unknown) => {
          if (!previous && error instanceof SiwcFault && error.code === 'reauthorize') {
            throw new RetryRegistration(result.clientId)
          }
          throw error
        })
        const [wire, keys] = await Promise.all([exchange, this.keys(attempt)])
        if (!wire.id_token) throw new SiwcFault('identity')
        const id = await this.claims(wire.id_token, result.clientId, keys)
        if (id.nonce !== nonce || (previous && id.sub !== previous.identity.subject)) throw new SiwcFault('identity')
        const email = typeof id.email === 'string' && id.email_verified === true
          ? /^([^\s@])[^\s@]*(@[^\s@]{1,96})$/.exec(id.email)
          : null
        const label = email ? email[1] + '•••' + email[2] : undefined
        const identity = { clientId: result.clientId, subject: id.sub, ...(label ? { label } : {}) }
        const tokens = await this.tokens(wire, identity, keys)
        attempt.throwIfAborted()
        return { identity, tokens }
      } finally {
        await callback.close()
      }
    } catch (error) {
      if (signal.aborted) throw new SiwcFault('cancelled')
      if (deadline.aborted) throw new SiwcFault('timeout')
      if (error instanceof SiwcFault) throw error
      throw new SiwcFault('callback')
    } finally {
      finished.abort()
    }
  }

  async refresh(identity: Identity, prior: Tokens, signal: AbortSignal): Promise<Tokens> {
    if (!prior.refresh) throw new SiwcFault('reauthorize')
    const keys = await this.keys(signal)
    const wire = await this.exchange(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: identity.clientId,
      refresh_token: prior.refresh,
      resource,
    }), signal)
    if (wire.id_token) {
      const claims = await this.claims(wire.id_token, identity.clientId, keys)
      if (claims.sub !== identity.subject) throw new SiwcFault('identity')
    }
    return this.tokens(wire, identity, keys, prior)
  }

  async revoke(identity: Identity, token: string, signal: AbortSignal): Promise<boolean> {
    try {
      const { revocation } = await this.discovery(signal)
      for (const pause of [0, 200]) {
        if (pause) await delay(pause, undefined, { signal })
        try {
          const response = await this.request(revocation, {
            method: 'POST',
            body: new URLSearchParams({
              client_id: identity.clientId,
              token,
              token_type_hint: 'refresh_token',
            }),
          }, signal)
          await response.body?.cancel().catch(() => {})
          if (response.status < 500) return response.status === 200
        } catch (error) {
          if (!(error instanceof SiwcFault) || !['temporary', 'timeout'].includes(error.code)) return false
        }
      }
    } catch {
      // Local sign-out still clears the record if revocation cannot be confirmed.
    }
    return false
  }
}
