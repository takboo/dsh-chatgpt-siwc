import { createHash } from 'node:crypto'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Responses } from 'openai/resources/responses'
import { z } from 'zod'
import { providerId } from '../identity.js'

export const toolNamespace = 'dsh'
export const callIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/)
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

export function prepareResponse(options: GenerateOptions, registration: string) {
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

  const input: Responses.ResponseInput = []
  const historyCalls = new Set<string>()
  const pending = new Set<string>()
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
          case 'tool-call':
            if (!callIdSchema.safeParse(block.id).success || !block.name || historyCalls.has(block.id) ||
              !validToolArguments(block.arguments)) invalidHistory()
            historyCalls.add(block.id)
            pending.add(block.id)
            input.push({
              type: 'function_call', namespace: toolNamespace, name: wireName(block.name),
              call_id: block.id, arguments: block.arguments,
            })
            break
          case 'reasoning':
            if (meta?.reasoning) input.push(meta.reasoning)
            else if (message.source.provider === providerId) {
              throw new LlmError('The stored reasoning has no supported replay state.', 'INVALID_REPLAY')
            }
            break
          default: invalidHistory()
        }
      }
    } else {
      const text = message.content.map(block => {
        if (block.type !== 'text') invalidHistory()
        return block.text
      }).join('')
      if (message.role === 'tool') {
        if (!pending.delete(message.toolCallId)) invalidHistory()
        input.push({
          type: 'function_call_output', call_id: message.toolCallId,
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
      ...(tools.length ? { tools: [{ type: 'namespace', name: toolNamespace, description: 'Local DeepSeek Harness tools', tools }] } : {}),
    } satisfies Responses.ResponseCreateParamsStreaming,
  }
}
