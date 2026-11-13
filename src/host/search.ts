import { LlmError } from '@deepseek-ai/dsh-llm'
import type { WebSearchProvider, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import type { Responses } from 'openai/resources/responses'
import { z } from 'zod'
import { providerId } from '../identity.js'
import type { Accounts, InferenceGrant } from './accounts.js'
import { streamResponse } from './responses.js'

const limit = 1024
const index = z.int().min(0).max(limit - 1)
const citation = z.object({ type: z.literal('url_citation'), url: z.string().max(8192), title: z.string().max(1024).optional() })
const output = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), id: z.string(), role: z.literal('assistant'),
    status: z.literal('completed').optional(), phase: z.string().nullish(),
    content: z.array(z.discriminatedUnion('type', [
      z.object({ type: z.literal('output_text'), text: z.string().max(131_072), annotations: z.array(z.unknown()).max(limit).optional() }),
      z.object({ type: z.literal('refusal') }),
    ])).max(limit) }),
  z.object({ type: z.literal('web_search_call'), id: z.string(), status: z.literal('completed') }),
  z.object({ type: z.literal('reasoning'), id: z.string() }),
])
const completed = z.object({ status: z.literal('completed').optional(), output: z.array(output).max(limit) })

function invalidSearch(): never {
  throw new LlmError('ChatGPT did not return a complete web search result.', 'INVALID_RESPONSE')
}

function searchSource(value: unknown): WebSearchSource | undefined {
  const parsed = citation.safeParse(value)
  if (!parsed.success) return
  const url = URL.parse(parsed.data.url)
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return
  const title = parsed.data.title?.trim()
  return { url: url.href, ...(title ? { title } : {}) }
}

async function* settleSearch(
  events: AsyncIterable<Responses.ResponseStreamEvent>, grant: InferenceGrant, signal: AbortSignal,
  failure: (code?: string) => LlmError,
): AsyncGenerator<WebSearchResult> {
  const done = new Map<number, z.infer<typeof output>>()
  const annotations: Responses.ResponseOutputTextAnnotationAddedEvent[] = []
  for await (const event of events) {
    signal.throwIfAborted()
    switch (event.type) {
      case 'response.output_item.done': {
        const parsed = output.safeParse(event.item)
        if (!parsed.success || !index.safeParse(event.output_index).success || done.has(event.output_index)) invalidSearch()
        done.set(event.output_index, parsed.data)
        break
      }
      case 'response.output_text.annotation.added':
        if (event.annotation?.type === 'url_citation') {
          if (annotations.length >= limit) invalidSearch()
          annotations.push(event)
        }
        break
      case 'response.failed': throw failure(event.response?.error?.code)
      case 'response.incomplete': throw failure('incomplete')
      case 'error': throw failure(event.code ?? undefined)
      case 'response.completed': {
        const parsed = completed.safeParse(event.response)
        if (!parsed.success) invalidSearch()
        const items = new Map(parsed.data.output.map((item, i) => [i, item]))
        for (const [i, item] of done) {
          const terminal = items.get(i)
          if (terminal && (terminal.id !== item.id || terminal.type !== item.type)) invalidSearch()
          if (!terminal) items.set(i, item)
        }
        if (![...items.values()].some(item => item.type === 'web_search_call')) invalidSearch()
        const sources = new Map<string, WebSearchSource>()
        const text: string[] = []
        for (const [i, item] of [...items].sort(([a], [b]) => a - b)) {
          if (item.type !== 'message' || item.phase === 'commentary') continue
          const snapshot = done.get(i)
          for (const [j, part] of item.content.entries()) {
            if (part.type !== 'output_text') continue
            text.push(part.text)
            const previous = snapshot?.type === 'message' ? snapshot.content[j] : undefined
            const streamed = annotations.filter(event => event.item_id === item.id && event.output_index === i && event.content_index === j)
            for (const value of [...part.annotations ?? [], ...(previous?.type === 'output_text' ? previous.annotations ?? [] : []),
              ...streamed.map(event => event.annotation)]) {
              const source = searchSource(value)
              if (source && !sources.has(source.url)) sources.set(source.url, source)
            }
          }
        }
        const content = text.join('\n').trim()
        if (!content || content.length > 131_072) invalidSearch()
        await grant.assertCurrent()
        signal.throwIfAborted()
        yield { content, sources: [...sources.values()], truncated: false }
        return
      }
    }
  }
  throw new LlmError('The ChatGPT search stream closed before completion.', 'TRANSPORT')
}

export function searchProvider(accounts: Accounts, fetch: typeof globalThis.fetch, enabled: () => boolean): WebSearchProvider {
  return {
    id: providerId,
    available: enabled,
    ready: async () => enabled() && !!await accounts.prepareInference().catch(() => undefined),
    async search({ query }, signal) {
      if (!enabled()) throw new LlmError('ChatGPT web search is disabled.', 'SIWC_UNAVAILABLE')
      const grant = await accounts.prepareInference(signal)
      if (!grant) throw new LlmError('Connect a ChatGPT account before using ChatGPT web search.', 'AUTH')
      const model = (await accounts.models(false, grant.signal)).find(model => model.supportsSearch)
      await grant.assertCurrent()
      if (!model) throw new LlmError('No ChatGPT model in this account advertises web search.', 'UNSUPPORTED_OPTION')
      const body: Responses.ResponseCreateParamsStreaming = {
        model: model.id,
        instructions: 'Use web search for the user’s query. Return a concise, factual summary with citations to your sources.',
        input: [{ role: 'user', content: query }],
        tools: [{ type: 'web_search' }], tool_choice: 'auto', store: false, stream: true,
        ...(model.reasoningEfforts?.includes('low') ? { reasoning: { effort: 'low' } } : {}),
      }
      for await (const result of streamResponse({ grant, fetch, signal }, () => ({ body }),
        (events, _request, active, signal, failure) => settleSearch(events, active, signal, failure))) {
        return result
      }
      return invalidSearch()
    },
  }
}
