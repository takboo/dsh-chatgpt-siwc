import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import { credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { planLabel, providerId } from './identity.js'
import { Accounts } from './host/accounts.js'
import { OAuth } from './host/oauth.js'
import type { OAuthDependencies } from './host/oauth.js'
import { responses } from './host/responses.js'
import { Settings } from './host/settings.js'
import { localOAuth } from './host/system-browser.js'

export const name = providerId
export const inject = ['llm', 'authorization', 'credentials']

class ChatGptAdapter extends LlmAdapter {
  constructor(private readonly accounts: Accounts, private readonly fetch?: typeof globalThis.fetch) {
    super()
  }

  override providerInfo(provider: string) {
    return { id: provider, name: 'ChatGPT' }
  }

  override async listModels(): Promise<LlmModelInfo[]> {
    try {
      return (await this.accounts.models()).map(({ id, name }) => ({
        id, name, provider: providerId, inputModalities: ['text'],
        badge: { text: planLabel, tone: 'success' },
      }))
    } catch {
      // The settings view offers the explicit retry and the safe error detail.
      return []
    }
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    const models = await this.accounts.models(false, signal).catch(() => [])
    const match = models.find(item => item.id === model)
    const contextWindow = match?.contextWindow
    return {
      ...this.modelInfo(provider, model), name: match?.name ?? model,
      ...(contextWindow === undefined ? {} : { context: { contextWindow } }),
    }
  }

  private modelInfo(provider: string, model: string) {
    return { provider, id: model, name: model, inputModalities: ['text'] as const, systemPromptUpdate: 'in-history' as const }
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    const grant = await this.accounts.prepareInference(signal)
    return {
      model: this.modelInfo(provider, model),
      stream: (options: GenerateOptions) => responses(options, grant, this.fetch),
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const grant = await this.accounts.prepareInference(options.signal)
    yield* responses(options, grant, this.fetch)
  }
}

export interface Config {
  enableLiveOAuth?: boolean
}

export function apply(ctx: Context, config?: Config): void {
  attachAccounts(ctx, config?.enableLiveOAuth === true ? localOAuth() : undefined)
}

export function attachAccounts(ctx: Context, dependencies?: OAuthDependencies): Accounts {
  const profile = (ctx.get('profileContext') as { name?: string } | undefined)?.name ?? 'isolated'
  const notify = () => ctx.emit('llm/models-updated', providerId)
  const accounts = new Accounts(ctx.credentials, ctx.authorization, profile, notify,
    dependencies && new OAuth(dependencies))
  ctx.llm.registerAdapter([providerId], new ChatGptAdapter(accounts, dependencies?.fetch))
  ctx.effect(() => () => accounts.dispose())
  ctx.on('credentials/record-updated', key => {
    if (key === accounts.selectionKey) accounts.invalidate()
    else if (credentialKeyScope(key) === providerId) notify()
  })
  ctx.plugin(Settings, accounts)
  return accounts
}
