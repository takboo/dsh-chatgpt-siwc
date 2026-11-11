import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { fixture, harness } from './fixtures.mjs'

const cleanups = []
try {
  const { dependencies, state } = fixture()
  state.time = Number(process.argv[3])
  state.refreshDelay = () => delay(100)
  const { accounts } = await harness({ after: cleanup => cleanups.push(cleanup) }, dependencies, process.argv[2])
  const active = (await accounts.view()).active
  const start = once(process, 'message')
  process.send({ active })
  await start
  const models = await accounts.models()
  const refreshes = state.requests.filter(({ form }) => form?.get('grant_type') === 'refresh_token').length
  process.send({ refreshes, models: models.map(model => model.id) })
} finally {
  for (const cleanup of cleanups.reverse()) await cleanup()
  process.disconnect()
}
