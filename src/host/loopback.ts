import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { SiwcFault } from './oauth.js'

const path = '/auth/callback'
const issuedId = /^oaiapp_[a-zA-Z0-9_-]{1,200}$/
const privateHeaders = { 'Cache-Control': 'no-store', 'Connection': 'close', 'Referrer-Policy': 'no-referrer' }

export async function listenForCallback(state: string, savedClient: string | undefined, signal: AbortSignal) {
  signal.throwIfAborted()
  let origin = ''
  let accepted = false
  let browserHandoff: { path: string; destination: string } | undefined
  const { promise: result, resolve, reject } = Promise.withResolvers<{ clientId: string; code: string }>()
  result.catch(() => {})
  const server = createServer((request, response) => {
    const reply = (status: number, text: string) => response.writeHead(status, {
      ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8',
    }).end(text)
    let url: URL
    try { url = new URL(request.url ?? '', origin) } catch { return reply(400, 'Invalid callback.') }
    if (request.method !== 'GET' || url.origin !== origin || request.headers.host !== url.host) {
      return reply(404, 'Not found.')
    }
    if (browserHandoff && request.url === browserHandoff.path) {
      if (accepted || signal.aborted) return reply(410, 'This sign-in attempt has ended.')
      const { destination } = browserHandoff
      browserHandoff = undefined
      return response.writeHead(303, { ...privateHeaders, Location: destination }).end()
    }
    if (url.pathname !== path) return reply(404, 'Not found.')
    if (accepted || signal.aborted) return reply(410, 'This sign-in attempt has ended.')
    const param = (key: string) => {
      const values = url.searchParams.getAll(key)
      if (values.length > 1) throw new SiwcFault('callback')
      return values[0]
    }
    try {
      const actual = Buffer.from(param('state') ?? '')
      const expected = Buffer.from(state)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        // An unrelated loopback request cannot consume the pending authorization.
        return reply(400, 'Invalid sign-in state.')
      }
      accepted = true
      const error = param('error')
      if (error) throw new SiwcFault(error === 'access_denied' ? 'cancelled' : 'callback')
      const client = param('client_id')
      const clientId = client ?? savedClient
      const code = param('code')
      if (!clientId || !issuedId.test(clientId) || (savedClient && clientId !== savedClient) || !code || code.length > 4096) {
        throw new SiwcFault('callback')
      }
      reply(200, 'Sign-in response received. Return to DeepSeek Harness.')
      resolve({ clientId, code })
    } catch (error) {
      reply(400, 'Sign-in was not completed. Return to DeepSeek Harness.')
      reject(error)
    }
  })
  let closing: Promise<void> | undefined
  function close() {
    signal.removeEventListener('abort', abort)
    closing ??= new Promise<void>(done => {
      server.close(() => done())
      server.closeAllConnections()
    })
    return closing
  }
  function abort() {
    reject(new SiwcFault('cancelled'))
    void close()
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new SiwcFault('callback')
    origin = `http://127.0.0.1:${address.port}`
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      throw new SiwcFault('cancelled')
    }
    return {
      redirect: origin + path, result, close,
      prepareBrowserHandoff(destination: URL) {
        signal.throwIfAborted()
        browserHandoff = {
          path: '/auth/start/' + randomBytes(32).toString('hex'), destination: destination.href,
        }
        return new URL(browserHandoff.path, origin)
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}
