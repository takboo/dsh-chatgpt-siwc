import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { IMAGE_OFFLOAD_REQUIRED_CODE, LlmError, offloadedImageText, requiredImageOffload } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, ImageBlock } from '@deepseek-ai/dsh-llm'
import type { Responses } from 'openai/resources/responses'
import { z } from 'zod'
import { providerId } from '../identity.js'
import type { SiwcReasoningEffort } from './catalog.js'

export const toolNamespace = 'dsh'
export const callIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export const assistantPhase = z.enum(['commentary', 'final_answer'])
export const reasoningReplay = z.object({
  type: z.literal('reasoning'),
  id: z.string().regex(/^rs_[A-Za-z0-9_-]{1,256}$/),
  summary: z.array(z.object({ type: z.literal('summary_text'), text: z.string() })).max(128),
  encrypted_content: z.string().min(1).max(1_048_576),
})
const replaySchema = z.object({
  response: z.object({ version: z.literal(1), registration: z.string() }),
  blocks: z.array(z.object({
    order: z.number().int().nonnegative(), reasoning: reasoningReplay.optional(), phase: assistantPhase.optional(),
  })),
})

export function validToolArguments(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function wireName(name: string): string {
  const label = name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 22)
  return label + '_' + createHash('sha256').update(name).digest('hex').slice(0, 40)
}

function invalidHistory(): never {
  throw new LlmError('The conversation contains unsupported content or an incomplete tool exchange.', 'INVALID_REQUEST')
}

type RequestImage = Awaited<ReturnType<Context['attachments']['readImageRequest']>>
export type ReadRequestImage = (ref: ImageBlock['attachment'], signal: AbortSignal) => Promise<RequestImage>

// Use the same inline image budget as DSH's Pi adapter.
const maxRequestImageBytes = 20 * 1024 * 1024

async function prepareUserImages(options: GenerateOptions, signal: AbortSignal, readImage?: ReadRequestImage) {
  const images = new Map<ImageBlock, RequestImage>()
  const sizes = new Map<ImageBlock, number>()
  let encodedBytes = 0
  for (const message of options.messages) {
    if (message.role !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'image' || block.offloaded) continue
      if (!readImage) invalidHistory()
      try {
        signal.throwIfAborted()
        const image = await readImage(block.attachment, signal)
        const bytes = image.data.byteLength
        sizes.set(block, bytes)
        encodedBytes += 4 * Math.ceil(bytes / 3)
        if (encodedBytes <= maxRequestImageBytes) images.set(block, image)
      } catch {
        signal.throwIfAborted()
        throw new LlmError('A conversation image could not be read from the attachment store.', 'INVALID_ATTACHMENT')
      }
    }
  }
  if (encodedBytes > maxRequestImageBytes) {
    // Tool images use zero bytes but count toward the host's oldest-image prefix.
    const offloadImages = requiredImageOffload(options.messages, { representation: 'base64', maxBytes: maxRequestImageBytes },
      block => sizes.get(block) ?? 0)
    throw new LlmError('The ChatGPT request exceeds its inline image budget.', IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages })
  }
  return images
}

export async function prepareResponse(
  options: GenerateOptions, registration: string, effort: SiwcReasoningEffort | undefined,
  requestSummary: boolean, signal: AbortSignal, readImage?: ReadRequestImage,
) {
  const offered = new Map<string, string>()
  const tools: Responses.FunctionTool[] = []
  const localNames = new Set<string>()
  for (const tool of options.tools ?? []) {
    const name = wireName(tool.name)
    if (!tool.name || localNames.has(tool.name) || offered.has(name)) invalidHistory()
    localNames.add(tool.name)
    offered.set(name, tool.name)
    tools.push({ type: 'function', name, description: tool.description, parameters: tool.parameters, strict: false })
  }

  const images = await prepareUserImages(options, signal, readImage)
  const input: Responses.ResponseInput = []
  const historyCalls = new Set<string>()
  const hostCalls = new Set<string>()
  const pending = new Map<string, string>()
  if (options.system) input.push({ role: 'developer', content: options.system })
  for (const message of options.messages) {
    if (message.role === 'assistant') {
      const state = message.source.provider === providerId ? message.source.replayState : undefined
      const replay = state === undefined ? undefined : replaySchema.safeParse(state)
      if (replay && (!replay.success || replay.data.blocks.length !== message.content.length ||
        (replay.data.response.registration !== registration && replay.data.blocks.some(meta => meta.reasoning)))) {
        throw new LlmError('The stored ChatGPT response cannot be replayed with this registration.', 'INVALID_REPLAY')
      }
      const saved = replay?.data?.blocks
      const order = message.content.map((block, index) => ({ block, meta: saved?.[index] }))
      if (saved) {
        if (new Set(saved.map(meta => meta.order)).size !== saved.length) invalidHistory()
        order.sort((a, b) => a.meta!.order - b.meta!.order)
      }
      for (const { block, meta } of order) {
        if ((meta?.reasoning && block.type !== 'reasoning') || (meta?.phase && block.type !== 'text')) invalidHistory()
        switch (block.type) {
          case 'text':
            if (block.text) {
              input.push({ role: 'assistant', content: block.text, ...(meta?.phase ? { phase: meta.phase } : {}) })
            }
            break
          case 'tool-call': {
            if (!block.id || !block.name || hostCalls.has(block.id) ||
              !validToolArguments(block.arguments)) invalidHistory()
            // Other adapters can use host IDs such as Pi's call_id|item_id.
            // Keep them in the session and project the same wire ID on both sides.
            let id: string = block.id
            if (!callIdSchema.safeParse(id).success) {
              if (message.source.provider === providerId) invalidHistory()
              id = 'call_dsh_' + createHash('sha256').update(id).digest('base64url')
            }
            if (historyCalls.has(id)) invalidHistory()
            historyCalls.add(id)
            hostCalls.add(block.id)
            pending.set(block.id, id)
            input.push({
              type: 'function_call', namespace: toolNamespace, name: wireName(block.name),
              call_id: id, arguments: block.arguments,
            })
            break
          }
          case 'reasoning':
            if (meta?.reasoning) input.push(meta.reasoning)
            // A cancelled attempt can leave a visible summary without a sealed item.
            else if (saved) {
              throw new LlmError('The stored reasoning has no supported replay state.', 'INVALID_REPLAY')
            }
            break
          default: invalidHistory()
        }
      }
    } else if (message.role === 'user' && message.content.some(block => block.type === 'image' && !block.offloaded)) {
      const content: Responses.ResponseInputContent[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          if (block.text) content.push({ type: 'input_text', text: block.text })
        } else if (block.type === 'image') {
          if (block.offloaded) content.push({ type: 'input_text', text: offloadedImageText(block.attachment) })
          else {
            const image = images.get(block)!
            const base64 = Buffer.from(image.data).toString('base64')
            content.push({ type: 'input_image', image_url: `data:${image.mediaType};base64,${base64}`, detail: 'auto' })
          }
        } else invalidHistory()
      }
      input.push({ role: 'user', content })
    } else {
      const text = message.content.map(block => {
        if (block.type === 'image') {
          if (block.offloaded && (message.role === 'user' || message.role === 'tool')) return offloadedImageText(block.attachment)
          if (message.role === 'tool') return '\n[tool result image omitted]\n'
        }
        if (block.type !== 'text') invalidHistory()
        return block.text
      }).join('')
      if (message.role === 'tool') {
        const id = pending.get(message.toolCallId)
        if (id === undefined) invalidHistory()
        pending.delete(message.toolCallId)
        input.push({
          type: 'function_call_output', call_id: id,
          output: message.isError ? 'Tool execution failed.\n' + text : text,
        })
      } else if (text) {
        input.push({ role: message.role === 'user' ? 'user' : 'developer', content: text })
      }
    }
  }
  if (pending.size) invalidHistory()

  return {
    offered, historyCalls,
    body: {
      model: options.model,
      input,
      store: false,
      stream: true,
      include: ['reasoning.encrypted_content'],
      ...(requestSummary ? { reasoning: { effort, summary: 'concise' } as const }
        : effort === undefined ? {} : { reasoning: { effort } }),
      ...(tools.length ? { tools: [{ type: 'namespace', name: toolNamespace, description: 'Local DeepSeek Harness tools', tools }] } : {}),
    } satisfies Responses.ResponseCreateParamsStreaming,
  }
}
