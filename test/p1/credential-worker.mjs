import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'

const ctx = new Context()
const backing = ctx.plugin(LocalCredentials, { path: process.argv[2], watch: false })
const key = credentialKey('chatgpt-siwc', 'fixture-registration')
try {
  await backing
  const initial = await ctx.credentials.readRecord(key)
  const start = once(process, 'message')
  process.send({ ready: true, generation: initial.payload.generation, refresh: initial.payload.refresh })
  await start
  let rotated = false
  let observedRefresh
  await ctx.credentials.modifyRecord(key, async (record) => {
    observedRefresh = record?.payload.refresh
    if (record?.payload.generation !== initial.payload.generation || observedRefresh !== initial.payload.refresh) {
      return undefined
    }
    await delay(80)
    rotated = true
    return { kind: 'grant', payload: { ...record.payload, refresh: 'synthetic-next' } }
  })
  process.send({ rotated, observedRefresh })
} finally {
  await backing.dispose()
  process.disconnect()
}
