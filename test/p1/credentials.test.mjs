import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'

const key = credentialKey('chatgpt-siwc', 'fixture-registration')
const grant = { kind: 'grant', payload: { generation: 1, refresh: 'synthetic-old' } }

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-siwc-credentials-'))
  const path = join(directory, 'credentials.yaml')
  const ctx = new Context()
  const backing = ctx.plugin(LocalCredentials, { path, watch: false })
  t.after(async () => {
    await backing.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  await backing
  await ctx.credentials.modifyRecord(key, async () => grant)
  return { path, credentials: ctx.credentials }
}

test('two processes re-read under the backing lock and rotate a synthetic grant once', async (t) => {
  const { path } = await setup(t)
  const program = fileURLToPath(new URL('credential-worker.mjs', import.meta.url))
  const workers = Array.from({ length: 2 }, () => {
    const worker = fork(program, [path], { signal: t.signal, timeout: 9000 })
    const exit = new Promise((resolve, reject) => {
      worker.once('error', reject)
      worker.once('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Credential fixture exited with code ${code}`))
      })
    })
    // Observe exit before waiting for IPC so early failures surface immediately.
    exit.catch(() => {})
    const nextMessage = () => Promise.race([
      once(worker, 'message').then(([message]) => message),
      exit.then(() => { throw new Error('Credential fixture exited before sending its result') }),
    ])
    return { worker, exit, nextMessage }
  })
  const ready = await Promise.all(workers.map(({ nextMessage }) => nextMessage()))
  assert.deepEqual(ready, Array.from({ length: 2 }, () => ({
    ready: true, generation: 1, refresh: 'synthetic-old',
  })))
  const outcomes = workers.map(({ nextMessage }) => nextMessage())
  for (const { worker } of workers) worker.send('start')
  assert.deepEqual((await Promise.all(outcomes)).sort((a, b) => Number(b.rotated) - Number(a.rotated)), [
    { rotated: true, observedRefresh: 'synthetic-old' },
    { rotated: false, observedRefresh: 'synthetic-next' },
  ])
  await Promise.all(workers.map(({ exit }) => exit))
})

test('an in-flight credential write cannot replace a signed-out generation', async (t) => {
  const { credentials } = await setup(t)
  const initial = await credentials.readRecord(key)
  const { promise: response, resolve } = Promise.withResolvers()
  const staleWrite = response.then((replacement) => credentials.modifyRecord(key, async (record) => {
    if (record?.payload.generation !== initial.payload.generation) return undefined
    return { kind: 'grant', payload: { ...record.payload, refresh: replacement } }
  }))

  const signedOut = { kind: 'grant', payload: { generation: 2, status: 'signed-out' } }
  await credentials.modifyRecord(key, async () => signedOut)
  resolve('synthetic-late')
  await staleWrite
  assert.deepEqual(await credentials.readRecord(key), signedOut)
})
