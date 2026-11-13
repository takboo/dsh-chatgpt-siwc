import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-web'
import { credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { providerId } from './identity.js'
import { Accounts } from './host/accounts.js'
import type { CatalogModel } from './host/catalog.js'
import { OAuth, SiwcFault } from './host/oauth.js'
import type { OAuthDependencies } from './host/oauth.js'
import { responses } from './host/responses.js'
import { searchProvider } from './host/search.js'
import { Settings } from './host/settings.js'
import { localOAuth } from './host/system-browser.js'

export const name = providerId
export const inject = ['llm', 'authorization', 'credentials']

class ChatGptAdapter extends LlmAdapter {
  constructor(
    private readonly accounts: Accounts,
    private readonly attachments: () => Context['attachments'] | undefined,
    private readonly fetch?: typeof globalThis.fetch,
  ) {
    super()
  }

  override providerInfo(provider: string) {
    return { id: provider, name: 'GPT 订阅' }
  }

  override async listModels(): Promise<LlmModelInfo[]> {
    try {
      const models = await this.accounts.models()
      const hasAttachments = this.attachments() !== undefined
      return models.map(({ id, name, supportsImages }) => ({
        id, name, provider: providerId, inputModalities: supportsImages && hasAttachments ? ['text', 'image'] : ['text'],
      }))
    } catch {
      // The settings view offers the explicit retry and the safe error detail.
      return []
    }
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    const match = await this.catalogModel(model, signal)
    return this.modelInfo(provider, model, match, match?.supportsImages === true && this.attachments() !== undefined)
  }

  private async catalogModel(model: string, signal?: AbortSignal) {
    const models = await this.accounts.models(false, signal).catch(() => [])
    signal?.throwIfAborted()
    return models.find(item => item.id === model)
  }

  private modelInfo(provider: string, model: string, match: CatalogModel | undefined, supportsImages: boolean) {
    const contextWindow = match?.contextWindow
    const efforts = match?.reasoningEfforts?.map(effort => ({
      id: ReasoningEffortId(effort),
      name: effort === 'xhigh' ? 'Extra High' : effort.charAt(0).toUpperCase() + effort.slice(1),
    }))
    return {
      provider, id: model, name: match?.name ?? model,
      inputModalities: supportsImages ? ['text', 'image'] as const : ['text'] as const,
      systemPromptUpdate: 'in-history' as const,
      ...(contextWindow === undefined ? {} : { context: { contextWindow } }),
      ...(efforts === undefined ? {} : { reasoning: { efforts } }),
    }
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    const grant = await this.accounts.prepareInference(signal)
    let match: CatalogModel | undefined
    if (grant) {
      try {
        match = await this.catalogModel(model, grant.signal)
        await grant.assertCurrent()
      } catch (error) {
        if (grant.signal.aborted || (error instanceof SiwcFault && (error.code === 'stale' || error.code === 'cancelled'))) {
          throw new LlmError('The ChatGPT request was cancelled.', 'ABORTED')
        }
        throw error
      }
    }
    const attachments = match?.supportsImages === true ? this.attachments() : undefined
    return {
      model: this.modelInfo(provider, model, match, attachments !== undefined),
      stream: (options: GenerateOptions) => responses(options, grant, this.fetch, match?.reasoningEfforts ?? [],
        match?.supportsReasoningSummary === true,
        attachments && ((ref, signal) => attachments.readImageRequest(ref, this.imageRequestTarget(provider, model, ref), signal))),
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal)
    yield* prepared.stream(options)
  }
}

export interface Config {
  enableLiveOAuth?: unknown
  enableChatGptSearch?: Volatile<boolean>
}

export const Config = z.object({
  enableLiveOAuth: z.any(),
  enableChatGptSearch: z.boolean().default(false).volatile(),
})

export function apply(ctx: Context, config?: Config): void {
  attachAccounts(ctx, config?.enableLiveOAuth === true ? localOAuth() : undefined,
    () => config?.enableChatGptSearch?.get() === true)
}

export function attachAccounts(ctx: Context, dependencies?: OAuthDependencies, searchEnabled = () => false): Accounts {
  const profile = (ctx.get('profileContext') as { name?: string } | undefined)?.name ?? 'isolated'
  const notify = () => ctx.emit('llm/models-updated', providerId)
  const accounts = new Accounts(ctx.credentials, ctx.authorization, profile, notify,
    dependencies && new OAuth(dependencies))
  ctx.llm.registerAdapter([providerId], new ChatGptAdapter(accounts, () => ctx.get('attachments'), dependencies?.fetch))
  if (dependencies) {
    ctx.inject(['web'], child => {
      child.effect(() => child.web.registerSearchProvider(searchProvider(accounts, dependencies.fetch, searchEnabled)))
    })
  }
  ctx.effect(() => () => accounts.dispose())
  ctx.on('credentials/record-updated', key => {
    if (key === accounts.selectionKey) accounts.invalidate()
    else if (credentialKeyScope(key) === providerId) notify()
  })
  ctx.plugin(Settings, accounts)
  return accounts
}
