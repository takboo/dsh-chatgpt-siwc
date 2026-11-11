import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import { credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { providerId } from './identity.js'
import { Accounts } from './host/accounts.js'
import { OAuth } from './host/oauth.js'
import type { OAuthDependencies } from './host/oauth.js'
import { Settings } from './host/settings.js'

export const name = providerId
export const inject = ['llm', 'authorization', 'credentials']

class ChatGptAdapter extends LlmAdapter {
  constructor(private readonly accounts: Accounts) {
    super()
  }

  override providerInfo(provider: string) {
    return { id: provider, name: 'ChatGPT' }
  }

  override providerRetryPolicy() {
    return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, providerId)
  }

  override async listModels(): Promise<LlmModelInfo[]> {
    try {
      return (await this.accounts.models()).map(model => ({
        ...model, provider: providerId, inputModalities: ['text'],
      }))
    } catch {
      // The settings view offers the explicit retry and the safe error detail.
      return []
    }
  }

  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    const models = await this.accounts.models(false, signal).catch(() => [])
    const match = models.find(item => item.id === model)
    return match
      ? { ...match, provider, inputModalities: ['text'] as const }
      : super.resolveModel(provider, model, signal)
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (
      options.purpose === 'session-title' ||
      options.purpose === 'compaction' ||
      options.maxTokens !== undefined ||
      options.temperature !== undefined ||
      options.stop !== undefined
    ) {
      throw new LlmError('This request option or purpose is unsupported by ChatGPT plan usage.', 'UNSUPPORTED_OPTION')
    }

    throw new LlmError('ChatGPT inference is unavailable in this build.', 'SIWC_UNAVAILABLE')
  }
}

export function apply(ctx: Context): void {
  attachAccounts(ctx)
}

export function attachAccounts(ctx: Context, dependencies?: OAuthDependencies): Accounts {
  const profile = (ctx.get('profileContext') as { name?: string } | undefined)?.name ?? 'isolated'
  const notify = () => ctx.emit('llm/models-updated', providerId)
  const accounts = new Accounts(ctx.credentials, ctx.authorization, profile, notify,
    dependencies && new OAuth(dependencies))
  ctx.llm.registerAdapter([providerId], new ChatGptAdapter(accounts))
  ctx.effect(() => () => accounts.dispose())
  ctx.on('credentials/record-updated', key => {
    if (key === accounts.selectionKey) accounts.invalidate()
    else if (credentialKeyScope(key) === providerId) notify()
  })
  ctx.plugin(Settings, accounts)
  return accounts
}
