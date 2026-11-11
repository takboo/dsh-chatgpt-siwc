import { createHash, randomUUID } from 'node:crypto'
import type { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { credentialKey, credentialKeyId, credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { providerId } from '../identity.js'
import type { AccountStatus, ModelView, SettingsResult, SettingsView } from '../view.js'
import { fetchCatalog } from './catalog.js'
import { RetryRegistration, SiwcFault, hasPlan, identitySchema, tokenSchema } from './oauth.js'
import type { OAuth } from './oauth.js'

const idSchema = z.uuid()
const accountSchema = z.object({
  version: z.literal(1),
  generation: z.uuid(),
  status: z.enum(['connected', 'signedOut', 'signingOut', 'reauthorize']),
  identity: identitySchema,
  tokens: tokenSchema.optional(),
  revocationUnknown: z.boolean().optional(),
}).refine(value => (value.status === 'connected' || value.status === 'signingOut') === Boolean(value.tokens))
const selectionSchema = z.object({ revision: z.uuid(), active: idSchema.nullable(), confirmed: z.boolean() })
const hostKey = credentialKey(providerId, 'host')
const hostSchema = z.object({ id: z.string().regex(/^urn:uuid:[0-9a-f-]{36}$/) })
const accountPrefix = 'account-'
const catalogTtl = 60_000

export interface InferenceGrant {
  registration: string
  signal: AbortSignal
  access(signal: AbortSignal): Promise<string>
  assertCurrent(): Promise<void>
}

type Account = z.infer<typeof accountSchema>
type Selection = z.infer<typeof selectionSchema>
const accountKey = (id: string) => credentialKey(providerId, accountPrefix + id)

function decode<T>(record: CredentialRecord | undefined, schema: z.ZodType<T>): T | undefined {
  if (record === undefined) return undefined
  const parsed = schema.safeParse(record.kind === 'grant' ? record.payload : undefined)
  if (!parsed.success) throw new SiwcFault('storage')
  return parsed.data
}

function grant<T>(payload: T): CredentialRecord {
  return { kind: 'grant', payload }
}

function usable(account: Account | undefined): account is Account & { tokens: NonNullable<Account['tokens']> } {
  return account?.status === 'connected' && !!account.tokens && hasPlan(account.tokens)
}

function clearTokens(account: Account, status: 'signedOut' | 'reauthorize', unknown = account.revocationUnknown) {
  return grant({
    version: account.version, identity: account.identity, generation: account.generation, status,
    ...(unknown ? { revocationUnknown: true } : {}),
  })
}

export class Accounts {
  readonly selectionKey: CredentialKey
  private readonly lifetime = new AbortController()
  private pending?: { controller: AbortController; id: string; committing: boolean; done: Promise<void> }
  private selectionSignal = new AbortController()
  private cached?: { id: string; generation: string; until: number; models: ModelView[] }
  private readonly uncertainRefreshes = new Map<string, string>()
  private retryClient?: string

  constructor(
    private readonly store: Pick<CredentialProvider, 'readRecord' | 'listRecords' | 'modifyRecord'>,
    private readonly authorization: Pick<AuthorizationService, 'begin' | 'registerFlow'>,
    profile: string,
    private readonly changed: () => void,
    private readonly api?: OAuth,
  ) {
    this.selectionKey = credentialKey(providerId, 'profile-' + createHash('sha256').update(profile).digest('hex'))
  }

  dispose() {
    this.lifetime.abort()
    this.selectionSignal.abort()
  }

  invalidate() {
    this.selectionSignal.abort()
    this.selectionSignal = new AbortController()
    this.cached = undefined
    this.changed()
  }

  private account(id: string) {
    return this.store.readRecord(accountKey(id)).then(record => decode(record, accountSchema))
  }

  private async selection(fresh = false) {
    const record = fresh
      ? await this.store.modifyRecord(this.selectionKey, async () => undefined)
      : await this.store.readRecord(this.selectionKey)
    return decode(record, selectionSchema)
  }

  private async host() {
    const record = await this.store.modifyRecord(hostKey, async (current) =>
      decode(current, hostSchema) ? undefined : grant({ id: 'urn:uuid:' + randomUUID() }))
    return decode(record, hostSchema)!.id
  }

  private async select(active: string | null, matches: (current: Selection | undefined) => boolean) {
    await this.store.modifyRecord(this.selectionKey, async record => {
      const current = decode(record, selectionSchema)
      if (!matches(current)) return undefined
      return grant({ revision: randomUUID(), active, confirmed: current?.confirmed ?? false })
    })
  }

  async view(): Promise<SettingsView> {
    const selection = await this.selection()
    const records = await this.store.listRecords()
    const entries = records.filter(({ key }) =>
      credentialKeyScope(key) === providerId && credentialKeyId(key).startsWith(accountPrefix))
    const accounts = await Promise.all(entries.map(async ({ key }) => {
      const id = credentialKeyId(key).slice(accountPrefix.length)
      if (!idSchema.safeParse(id).success) return undefined
      const account = await this.account(id)
      if (!account) return undefined
      const status: AccountStatus = this.uncertainRefreshes.get(id) === account.generation ? 'reauthorize'
        : account.status === 'signingOut' ? 'signedOut'
        : account.status === 'connected' && !usable(account) ? 'identityOnly' : account.status
      const suffix = id.slice(0, 6)
      return { id, label: (account.identity.label ?? 'ChatGPT') + ' · ' + suffix, status, generation: account.generation }
    }))
    const activeAccount = accounts.find(account => account?.id === selection?.active && account?.status === 'connected')
    const active = activeAccount?.id ?? null
    const cache = this.cached
    return {
      available: this.api !== undefined,
      authorizing: this.pending !== undefined,
      accounts: accounts.flatMap(account => account
        ? [{ id: account.id, label: account.label, status: account.status }] : []),
      active,
      confirmPlan: active !== null && selection?.confirmed === false,
      models: cache && active === cache.id && cache.generation === activeAccount?.generation
        && cache.until > (this.api?.now() ?? Date.now()) ? cache.models : null,
    }
  }

  async cancel() {
    this.retryClient = undefined
    const pending = this.pending
    if (pending?.committing === false) pending.controller.abort()
    await pending?.done
  }

  async login(id?: string, carrier?: AbortSignal) {
    const api = this.api
    if (!api) throw new SiwcFault('offline')
    if (this.pending) throw new SiwcFault('busy')
    const { promise: done, resolve: finish } = Promise.withResolvers<void>()
    const pending = { controller: new AbortController(), id: id ?? randomUUID(), committing: false, done }
    this.pending = pending
    const signal = AbortSignal.any([this.lifetime.signal, pending.controller.signal, ...(carrier ? [carrier] : [])])
    const key = accountKey(pending.id)
    let dispose: (() => void) | undefined
    let connected: Account | undefined
    try {
      const [previous, selection, host] = await Promise.all([
        this.account(pending.id), this.selection(), this.host(),
      ])
      if ((id && !previous) || previous?.status === 'signingOut') throw new SiwcFault('stale')
      dispose = this.authorization.registerFlow({
        key,
        label: 'ChatGPT',
        methods: [{ id: 'siwc', label: 'Continue with ChatGPT' }],
        run: async (session) => {
          const attempt = AbortSignal.any([signal, session.signal])
          const result = await api.login(host, attempt, previous, id ? undefined : this.retryClient)
          connected = {
            version: 1, status: 'connected', generation: randomUUID(), ...result,
          }
          await this.store.modifyRecord(key, async (record) => {
            const current = decode(record, accountSchema)
            if (attempt.aborted || current?.generation !== previous?.generation) throw new SiwcFault('stale')
            pending.committing = true
            return grant(connected)
          })
        },
      })
      const result = await this.authorization.begin({
        key, signal,
        interaction: { notify() {}, async prompt() { throw new SiwcFault('callback') } },
      })
      if (result.status !== 'authorized' || signal.aborted) throw new SiwcFault('cancelled')
      if (!id) this.retryClient = undefined
      this.uncertainRefreshes.delete(pending.id)
      if (usable(connected)) {
        await this.select(pending.id, current =>
          !signal.aborted && current?.revision === selection?.revision)
      } else if (selection?.active === pending.id) {
        await this.select(null, current => current?.revision === selection.revision)
      }
    } catch (error) {
      if (error instanceof RetryRegistration) this.retryClient = error.clientId
      throw error instanceof SiwcFault ? error : new SiwcFault('storage')
    } finally {
      dispose?.()
      this.pending = undefined
      finish()
    }
  }

  async activate(id: string) {
    const account = await this.account(id)
    if (!usable(account)) throw new SiwcFault('permission')
    if (this.uncertainRefreshes.get(id) === account.generation) throw new SiwcFault('reauthorize')
    this.retryClient = undefined
    this.selectionSignal.abort()
    await this.select(id, () => !this.lifetime.signal.aborted)
  }

  async confirm() {
    await this.store.modifyRecord(this.selectionKey, async record => {
      const current = decode(record, selectionSchema)
      return current?.active ? grant({ ...current, confirmed: true }) : undefined
    })
  }

  async logout(id: string): Promise<NonNullable<Extract<SettingsResult, { ok: true }>['revocation']>> {
    if (this.pending?.id === id) void this.cancel()
    this.invalidate()
    const key = accountKey(id)
    const generation = randomUUID()
    let uncertain = false
    const marked = decode(await this.store.modifyRecord(key, async (record) => {
      const current = decode(record, accountSchema)
      if (!current) return undefined
      uncertain = current.revocationUnknown === true || this.uncertainRefreshes.get(id) === current.generation
      if (current.status === 'signedOut') return undefined
      if (!current.tokens) return clearTokens({ ...current, generation }, 'signedOut', uncertain)
      return grant({ ...current, generation, status: 'signingOut' })
    }), accountSchema)
    try {
      await this.select(null, current => current?.active === id)
      if (marked?.generation !== generation || !marked.tokens?.refresh) return uncertain ? 'unconfirmed' : 'localOnly'
      const confirmed = await this.api?.revoke(marked.identity, marked.tokens.refresh, this.lifetime.signal)
      uncertain ||= !confirmed
      return uncertain ? 'unconfirmed' : 'confirmed'
    } finally {
      await this.store.modifyRecord(key, async (record) => {
        const current = decode(record, accountSchema)
        if (current?.generation !== generation || current.status !== 'signingOut') return undefined
        return clearTokens(current, 'signedOut', uncertain)
      })
      this.uncertainRefreshes.delete(id)
      this.invalidate()
    }
  }

  private async currentToken(id: string, expected: Account, api: OAuth, signal: AbortSignal) {
    const key = accountKey(id)
    let attempted = false
    let result
    try {
      result = decode(await this.store.modifyRecord(key, async record => {
        signal.throwIfAborted()
        const current = decode(record, accountSchema)
        if (!usable(current) || current.generation !== expected.generation) throw new SiwcFault('stale')
        const now = api.now()
        const refreshAt = current.tokens.refreshAt ?? 0
        if (current.tokens.expiresAt - now > 30_000 || (refreshAt > now && current.tokens.expiresAt > now)) {
          return undefined
        }
        if (refreshAt > now) throw new SiwcFault('temporary')
        attempted = true
        try {
          return grant({ ...current, tokens: await api.refresh(current.identity, current.tokens, signal) })
        } catch (error) {
          if (error instanceof SiwcFault && error.code === 'configuration') throw error
          // A failed exchange may already have consumed a rotating refresh token.
          return clearTokens(current, 'reauthorize', !(error instanceof SiwcFault && error.code === 'reauthorize'))
        }
      }), accountSchema)
    } catch (error) {
      if (error instanceof SiwcFault) throw error
      if (attempted) this.uncertainRefreshes.set(id, expected.generation)
      throw new SiwcFault(signal.aborted ? 'cancelled' : 'storage')
    }
    if (!usable(result)) throw new SiwcFault(result?.status === 'reauthorize' ? 'reauthorize' : 'permission')
    return result.tokens.access
  }

  async prepareInference(caller?: AbortSignal): Promise<InferenceGrant | undefined> {
    const api = this.api
    if (!api) return undefined
    const signal = AbortSignal.any([this.lifetime.signal, this.selectionSignal.signal, ...(caller ? [caller] : [])])
    const selection = await this.selection(true)
    const id = selection?.active
    if (!id) return undefined
    const account = await this.account(id)
    if (!usable(account)) return undefined
    const assertCurrent = async () => {
      signal.throwIfAborted()
      const current = await this.selection(true)
      const latest = await this.account(id)
      signal.throwIfAborted()
      if (current?.revision !== selection.revision || !usable(latest) || latest.generation !== account.generation) {
        throw new SiwcFault('stale')
      }
      if (this.uncertainRefreshes.get(id) === latest.generation) throw new SiwcFault('reauthorize')
    }
    return {
      registration: createHash('sha256').update(id).digest('hex'),
      signal,
      assertCurrent,
      access: async operation => {
        await assertCurrent()
        const token = await this.currentToken(id, account, api, operation)
        await assertCurrent()
        operation.throwIfAborted()
        return token
      },
    }
  }

  async models(force = false, caller?: AbortSignal): Promise<ModelView[]> {
    const api = this.api
    if (!api) return []
    const signal = AbortSignal.any([
      this.lifetime.signal, this.selectionSignal.signal, ...(caller ? [caller] : []),
    ])
    const selection = await this.selection(true)
    const id = selection?.active
    if (!id) return []
    const account = await this.account(id)
    if (!usable(account)) return []
    if (this.uncertainRefreshes.get(id) === account.generation) throw new SiwcFault('reauthorize')
    if (force) this.cached = undefined
    const cached = this.cached
    if (cached?.id === id && cached.generation === account.generation && cached.until > api.now()) {
      const current = await this.selection(true)
      const latest = await this.account(id)
      if (signal.aborted || current?.revision !== selection.revision || !usable(latest) ||
        latest.generation !== cached.generation) throw new SiwcFault('stale')
      return cached.models
    }
    const token = await this.currentToken(id, account, api, signal)
    signal.throwIfAborted()
    const models = await fetchCatalog(api, token, signal)
    const currentSelection = await this.selection(true)
    const currentAccount = await this.account(id)
    if (signal.aborted || currentSelection?.revision !== selection.revision ||
      !usable(currentAccount) || currentAccount.generation !== account.generation) {
      throw new SiwcFault('stale')
    }
    this.cached = { id, generation: account.generation, until: Math.min(api.now() + catalogTtl, currentAccount.tokens.expiresAt), models }
    return models
  }
}
