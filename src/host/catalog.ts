import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type { ModelView } from '../view.js'
import { OAuth, SiwcFault, readJson, resource } from './oauth.js'

const catalogSchema = z.object({ models: z.array(z.unknown()).max(8192) })
const modelSchema = z.object({
  slug: z.string().min(1).max(256),
  display_name: z.string().trim().min(1).max(256),
  visibility: z.literal('list'),
})

export async function fetchCatalog(api: OAuth, token: string, signal: AbortSignal): Promise<ModelView[]> {
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
  const models = new Map<string, ModelView>()
  for (const value of payload.data.models) {
    const model = modelSchema.safeParse(value)
    if (model.success && !models.has(model.data.slug)) {
      models.set(model.data.slug, { id: model.data.slug, name: model.data.display_name })
    }
  }
  return [...models.values()]
}
