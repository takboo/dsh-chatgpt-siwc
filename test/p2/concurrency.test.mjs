import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { canary, fixture, harness } from './fixtures.mjs'

test('two processes exercise the P2 refresh path against one real backing and make one token exchange', async (t) => {
  const { dependencies, state } = fixture()
  const { accounts, path } = await harness(t, dependencies)
  await accounts.login()
  const id = (await accounts.view()).active
  const entry = fileURLToPath(new URL('rotate-worker.mjs', import.meta.url))
  const workers = [1, 2].map(() => {
    const child = fork(entry, [path, String(state.time + 301_000)], { signal: t.signal, timeout: 9000 })
    const exit = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Refresh fixture exited: ${code}`)))
    })
    exit.catch(() => {})
    const message = () => Promise.race([
      once(child, 'message').then(([value]) => value),
      exit.then(() => { throw new Error('Refresh fixture exited before sending a result') }),
    ])
    return { child, exit, message }
  })
  assert.deepEqual(await Promise.all(workers.map(worker => worker.message())), [{ active: id }, { active: id }])
  const outcomes = workers.map(worker => worker.message())
  for (const worker of workers) worker.child.send('begin')
  const results = await Promise.all(outcomes)
  assert.equal(results.reduce((sum, result) => sum + result.refreshes, 0), 1)
  assert.ok(results.every(result => result.models.join(',') === 'fixture-z,fixture-a'))
  await Promise.all(workers.map(worker => worker.exit))
})

test('logout in another composition wins over a late reauthorization callback', async (t) => {
  const { dependencies, state } = fixture()
  const first = await harness(t, dependencies)
  await first.accounts.login()
  const id = (await first.accounts.view()).active
  const second = await harness(t, dependencies, first.path)
  const { promise: opened, resolve: open } = Promise.withResolvers()
  const { promise: finish, resolve: reply } = Promise.withResolvers()
  state.callback = async () => { open(); await finish }

  const stale = first.accounts.login(id)
  const rejected = assert.rejects(stale, { code: 'stale' })
  await opened
  assert.equal(await second.accounts.logout(id), 'confirmed')
  reply()
  await rejected
  const stored = await second.ctx.credentials.readRecord(credentialKey('chatgpt-siwc', 'account-' + id))
  assert.equal(stored.payload.status, 'signedOut')
  assert.doesNotMatch(JSON.stringify(stored), new RegExp(canary))
  assert.equal((await second.accounts.view()).active, null)
})
