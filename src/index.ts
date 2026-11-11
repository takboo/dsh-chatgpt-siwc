import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { providerId } from './identity.js'

export const name = providerId
export const inject = ['llm']

class ChatGptAdapter extends LlmAdapter {
  override providerInfo(provider: string) {
    return { id: provider, name: 'ChatGPT' }
  }

  override providerRetryPolicy() {
    return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, providerId)
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

    throw new LlmError('ChatGPT sign-in is unavailable in this build.', 'SIWC_UNAVAILABLE')
  }
}

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter([providerId], new ChatGptAdapter())
}
