import { EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Responses } from 'openai/resources/responses'
import { z } from 'zod'
import { assistantPhase, callIdSchema, reasoningReplay, toolNamespace, validToolArguments } from './responses-request.js'

const count = z.number().int().nonnegative()
const usageSchema = z.object({
  input_tokens: count,
  output_tokens: count,
  total_tokens: count.optional(),
  input_tokens_details: z.object({ cached_tokens: count.optional(), cache_write_tokens: count.optional() }).optional(),
  output_tokens_details: z.object({ reasoning_tokens: count.optional() }).optional(),
})
const message = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  status: z.literal('completed').optional(),
  phase: assistantPhase.nullish(),
  content: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('output_text'), text: z.string() }),
    z.object({ type: z.literal('refusal'), refusal: z.string() }),
  ])),
})
const tool = z.object({
  type: z.literal('function_call'),
  status: z.literal('completed').optional(),
  namespace: z.literal(toolNamespace),
  call_id: callIdSchema,
  name: z.string(),
  arguments: z.string(),
  async: z.literal(false).optional(),
  caller: z.object({ type: z.literal('direct') }).nullish(),
})
const reasoningOutput = reasoningReplay.extend({
  encrypted_content: reasoningReplay.shape.encrypted_content.nullish(),
  status: z.literal('completed').optional(),
})
const reasoningDone = reasoningOutput.extend({ status: z.enum(['completed', 'incomplete']).optional() })
const completed = z.object({
  status: z.literal('completed').optional(),
  output: z.array(z.discriminatedUnion('type', [message, tool, reasoningOutput])).max(4096),
  usage: z.unknown().optional(),
})
const textDelta = z.object({ output_index: count, content_index: count, delta: z.string() })
const summaryEvent = z.object({
  output_index: count.max(4095),
  summary_index: count.max(127),
  item_id: reasoningReplay.shape.id.optional(),
})
const progress = new Set([
  'response.created', 'response.queued', 'response.in_progress',
  // SIWC may send metadata and keepalive between deltas and completion.
  'response.metadata', 'keepalive',
  'response.output_item.added',
  'response.content_part.added', 'response.content_part.done',
  'response.output_text.done', 'response.output_text.annotation.added',
  'response.refusal.delta', 'response.refusal.done',
  'response.function_call_arguments.delta', 'response.function_call_arguments.done',
  'response.reasoning_summary_part.added',
  'response.reasoning_text.delta', 'response.reasoning_text.done',
])

interface OutputBlock {
  key: string
  block: ContentBlock
  reasoning?: z.infer<typeof reasoningReplay>
  phase?: z.infer<typeof assistantPhase>
}

interface SummaryStream {
  id?: string
  parts: Map<number, { text: string; done: boolean }>
}

function liveSummary({ parts }: SummaryStream): string {
  const text: string[] = []
  for (let i = 0; i < parts.size; i++) {
    const part = parts.get(i)
    if (!part) break
    if (part.text) text.push(part.text)
    if (!part.done) break
  }
  return text.join('\n')
}

function invalidStream(detail = 'returned an invalid or unsupported stream event'): never {
  throw new LlmError(`ChatGPT ${detail}.`, 'INVALID_RESPONSE')
}

const completedFields = new Set([
  'status', 'output', 'type', 'role', 'phase', 'content', 'text', 'refusal',
  'namespace', 'call_id', 'name', 'arguments', 'async', 'caller', 'id', 'summary', 'encrypted_content',
])

function completedField(path: PropertyKey[] = []): string {
  let field = 'response.completed'
  for (const part of path) {
    if (typeof part === 'number') field += '[]'
    else if (typeof part === 'string' && completedFields.has(part)) field += `.${part}`
    else break
  }
  return field
}

export function toUsage(value: unknown): TokenUsage | undefined {
  const parsed = usageSchema.safeParse(value)
  if (!parsed.success) return undefined
  const data = parsed.data
  const cached = data.input_tokens_details?.cached_tokens
  const written = data.input_tokens_details?.cache_write_tokens
  const reasoning = data.output_tokens_details?.reasoning_tokens
  const input = data.input_tokens - (cached ?? 0) - (written ?? 0)
  const total = data.input_tokens + data.output_tokens
  if (input < 0 || !Number.isSafeInteger(total) || (reasoning ?? 0) > data.output_tokens) return undefined
  return {
    inputTokens: input, outputTokens: data.output_tokens,
    ...(data.total_tokens === undefined || data.total_tokens === total ? { totalTokens: total } : {}),
    ...(cached === undefined ? {} : { cacheReadTokens: cached }),
    ...(written === undefined ? {} : { cacheWriteTokens: written }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }),
  }
}

function outputBlocks(
  output: z.infer<typeof completed>['output'], offered: ReadonlyMap<string, string>, historyCalls: ReadonlySet<string>,
  reasoningItems: ReadonlyMap<number, z.infer<typeof reasoningDone>>,
  summaries: ReadonlyMap<number, SummaryStream>,
): OutputBlock[] {
  const ids = new Set(historyCalls)
  return output.flatMap((item, i): OutputBlock[] => {
    switch (item.type) {
      case 'message':
        return item.content.map((part, j) => ({
          key: `${i}:${j}`,
          block: { type: 'text', text: part.type === 'output_text' ? part.text : part.refusal },
          ...(item.phase ? { phase: item.phase } : {}),
        }))
      case 'function_call': {
        const name = offered.get(item.name)
        if (!name || ids.has(item.call_id) || !validToolArguments(item.arguments)) {
          invalidStream('returned an unoffered, duplicate, or malformed tool call')
        }
        ids.add(item.call_id)
        return [{ key: String(i), block: { type: 'tool-call', id: ToolCallId(item.call_id), name, arguments: item.arguments } }]
      }
      case 'reasoning': {
        const done = reasoningItems.get(i)
        const summary = summaries.get(i)
        const parts = Array.from({ length: Math.max(item.summary.length, done?.summary.length ?? 0) }, (_, index) => {
          const terminal = item.summary[index]
          const snapshot = done?.summary[index]
          return terminal?.text.trim() ? terminal : snapshot ?? terminal!
        })
        const parsed = reasoningReplay.safeParse({
          ...item, summary: parts, encrypted_content: item.encrypted_content ?? done?.encrypted_content,
        })
        if (!parsed.success) invalidStream('returned a reasoning item without matching replay data')
        const reasoning = parsed.data
        const partCount = Math.max(parts.length, ...Array.from(summary?.parts.keys() ?? [], index => index + 1))
        const text = Array.from({ length: partCount }, (_, index) =>
          parts[index]?.text.trim() ? parts[index]!.text : summary?.parts.get(index)?.text ?? '').filter(Boolean).join('\n')
        return [{
          key: String(i), reasoning,
          block: { type: 'reasoning', text },
        }]
      }
    }
  })
}

export async function* settleResponses(
  events: AsyncIterable<Responses.ResponseStreamEvent>,
  offered: ReadonlyMap<string, string>,
  historyCalls: ReadonlySet<string>,
  registration: string,
  signal: AbortSignal,
  assertCurrent: () => Promise<void>,
  failure: (code?: string) => LlmError,
  contentTypeDeclared: boolean,
): AsyncGenerator<StreamChunk> {
  const partial = new Map<string, { text: string; index: number; type: 'text' | 'reasoning' }>()
  const reasoningItems = new Map<number, z.infer<typeof reasoningDone>>()
  const summaries = new Map<number, SummaryStream>()
  let receivedEvent = false
  for await (const event of events) {
    signal.throwIfAborted()
    if (!event || typeof event.type !== 'string') invalidStream()
    receivedEvent = true
    switch (event.type) {
      case 'response.output_text.delta': {
        const result = textDelta.safeParse(event)
        if (!result.success) invalidStream('returned an invalid response.output_text.delta event')
        const key = `${result.data.output_index}:${result.data.content_index}`
        let block = partial.get(key)
        if (!block) {
          if (partial.size >= 4096) invalidStream('exceeded the response block limit')
          block = { text: '', index: partial.size, type: 'text' }
          partial.set(key, block)
          yield { type: 'block-start', index: block.index, blockType: 'text' }
        }
        block.text += result.data.delta
        yield { type: 'text-delta', index: block.index, text: result.data.delta }
        break
      }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_summary_text.done':
      case 'response.reasoning_summary_part.done': {
        const parsed = summaryEvent.safeParse(event)
        const delta = event.type === 'response.reasoning_summary_text.delta'
        const text = event.type === 'response.reasoning_summary_text.delta' ? event.delta
          : event.type === 'response.reasoning_summary_text.done' ? event.text : event.part?.text
        if (!parsed.success || typeof text !== 'string') invalidStream('returned an invalid reasoning summary event')
        const { output_index, summary_index, item_id } = parsed.data
        let summary = summaries.get(output_index)
        if (!summary) {
          summary = { parts: new Map() }
          summaries.set(output_index, summary)
        }
        if (item_id && summary.id && item_id !== summary.id) invalidStream('changed the reasoning summary item ID')
        summary.id ??= item_id
        const previous = summary.parts.get(summary_index)
        if (delta && previous?.done) break
        summary.parts.set(summary_index, {
          text: delta ? (previous?.text ?? '') + text : text || previous?.text || '',
          done: !delta,
        })
        const display = liveSummary(summary)
        if (!display.trim()) break
        const key = String(output_index)
        let block = partial.get(key)
        if (!block) {
          if (partial.size >= 4096) invalidStream('exceeded the response block limit')
          block = { text: '', index: partial.size, type: 'reasoning' }
          partial.set(key, block)
          yield { type: 'block-start', index: block.index, blockType: 'reasoning' }
        }
        // Done events can repeat an entire part. Emit only the new suffix.
        if (display.startsWith(block.text) && display.length > block.text.length) {
          const suffix = display.slice(block.text.length)
          block.text = display
          yield { type: 'reasoning-delta', index: block.index, text: suffix }
        }
        break
      }
      case 'response.output_item.done': {
        if (event.item?.type !== 'reasoning') break
        const item = reasoningDone.safeParse(event.item)
        if (!item.success || !count.safeParse(event.output_index).success ||
          reasoningItems.size >= 4096 || reasoningItems.has(event.output_index)) {
          invalidStream('returned an invalid or duplicate reasoning item in response.output_item.done')
        }
        if (item.data.status === 'incomplete') break
        reasoningItems.set(event.output_index, item.data)
        break
      }
      case 'response.failed':
      case 'response.incomplete': {
        const usage = toUsage(event.response?.usage)
        if (usage) yield { type: 'usage', usage }
        throw failure(event.type === 'response.incomplete' ? 'incomplete' : event.response?.error?.code)
      }
      case 'error':
        throw failure(event.code ?? undefined)
      case 'response.completed': {
        const result = completed.safeParse(event.response)
        if (!result.success) invalidStream(`returned an invalid field at ${completedField(result.error.issues[0]?.path)}`)
        for (const [index, reasoning] of reasoningItems) {
          const item = result.data.output[index]
          if (item?.type !== 'reasoning' || item.id !== reasoning.id) {
            invalidStream('returned reasoning output inconsistent with the completed stream item')
          }
        }
        for (const [index, summary] of summaries) {
          const item = result.data.output[index]
          if (item?.type !== 'reasoning' || (summary.id && summary.id !== item.id)) {
            invalidStream('returned reasoning output inconsistent with the streamed summary')
          }
        }
        const blocks = outputBlocks(result.data.output, offered, historyCalls, reasoningItems, summaries)
        const byKey = new Map(blocks.map(({ key, block }) => [key, block]))
        for (const [key, prefix] of partial) {
          const block = byKey.get(key)
          if (prefix.type === 'text' && (block?.type !== 'text' || !block.text.startsWith(prefix.text))) {
            invalidStream('returned final text inconsistent with the streamed text')
          }
        }
        await assertCurrent()
        signal.throwIfAborted()
        const replay: Array<{ order: number } & Pick<OutputBlock, 'reasoning' | 'phase'>> = []
        let next = partial.size
        for (const [order, { key, block, ...metadata }] of blocks.entries()) {
          signal.throwIfAborted()
          const existing = partial.get(key)
          const index = existing?.index ?? next++
          replay[index] = { order, ...metadata }
          if (!existing) yield { type: 'block-start', index, blockType: block.type }
          yield { type: 'block-end', index, block }
        }
        const usage = toUsage(result.data.usage)
        if (usage) yield { type: 'usage', usage }
        signal.throwIfAborted()
        if (blocks.length === 0) {
          throw new LlmError('ChatGPT completed the response without returning any content.', EMPTY_RESPONSE_CODE)
        }
        const needsReplay = replay.some((item, index) => item.reasoning || item.phase || item.order !== index)
        yield {
          type: 'finish',
          reason: { kind: blocks.some(({ block }) => block.type === 'tool-call') ? 'tool-calls' : 'stop' },
          ...(needsReplay ? { replayState: { response: { version: 1, registration }, blocks: replay } } : {}),
        }
        return
      }
      default:
        if (!progress.has(event.type)) invalidStream()
    }
  }
  if (!contentTypeDeclared && !receivedEvent) invalidStream()
  throw new LlmError('The ChatGPT stream closed before completion.', 'TRANSPORT')
}
