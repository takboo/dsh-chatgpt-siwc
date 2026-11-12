import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type { ModelView } from '../view.js'
import { OAuth, SiwcFault, readJson, resource } from './oauth.js'

// Known SIWC request values, offered only when the model also advertises them.
const knownReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type SiwcReasoningEffort = typeof knownReasoningEfforts[number]

export interface CatalogModel extends ModelView {
  contextWindow?: number
  reasoningEfforts?: readonly SiwcReasoningEffort[]
}

const catalogSchema = z.object({ models: z.array(z.unknown()).max(8192) })
const modelSchema = z.object({
  slug: z.string().min(1).max(256),
  display_name: z.string().trim().min(1).max(256),
  visibility: z.literal('list'),
  context_window: z.int().positive().optional().catch(undefined),
  supported_reasoning_levels: z.array(z.object({ effort: z.string() }).optional().catch(undefined))
    .max(128).optional().catch(undefined),
})

export async function fetchCatalog(api: OAuth, token: string, signal: AbortSignal): Promise<CatalogModel[]> {
  const response = await api.request(new URL(resource + '/models'), {
    headers: { ...attributionHeaders(), Authorization: 'Bearer ' + token, Accept: 'application/json' },
  }, signal)
  if (!response.ok) {
    if (response.status === 429) {
      const body = await readJson(response, 'rateLimit')
      const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(body)
      throw new SiwcFault(error.data?.error.code === 'subscription_sharing_usage_limit_exceeded' ? 'quota' : 'rateLimit')
    }
    await response.body?.cancel().catch(() => {})
    throw new SiwcFault(response.status === 401 ? 'reauthorize' : response.status === 403 ? 'permission' : 'temporary')
  }
  const payload = catalogSchema.safeParse(await readJson(response, 'catalog'))
  if (!payload.success) throw new SiwcFault('catalog')
  const models = new Map<string, CatalogModel>()
  for (const value of payload.data.models) {
    const model = modelSchema.safeParse(value)
    if (model.success && !models.has(model.data.slug)) {
      const { slug, display_name: name, context_window: contextWindow, supported_reasoning_levels: levels } = model.data
      const advertised = new Set(levels?.map(level => level?.effort))
      const reasoningEfforts = knownReasoningEfforts.filter(effort => advertised.has(effort))
      models.set(slug, {
        id: slug, name, ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(reasoningEfforts.length === 0 ? {} : { reasoningEfforts }),
      })
    }
  }
  return [...models.values()]
}
