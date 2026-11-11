import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { SiwcFault } from './oauth.js'
import type { OAuthDependencies } from './oauth.js'

export function localOAuth(): OAuthDependencies | undefined {
  const command = process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'linux' ? 'xdg-open' : undefined
  if (!command) return undefined
  return {
    fetch: globalThis.fetch.bind(globalThis),
    async openBrowser(_authorization, signal, prepareHandoff) {
      signal.throwIfAborted()
      // The launcher sees only an opaque loopback URL. The browser receives the
      // actual authorization URL in a one-time redirect from the Host.
      const child = spawn(command, [prepareHandoff().href], {
        detached: true, stdio: 'ignore', env: scrubbedParentEnv(),
      })
      child.unref()
      try {
        // Some Linux desktop launchers stay attached for the browser's lifetime.
        const [code] = await Promise.race([
          once(child, 'exit', { signal }),
          delay(1000, [0], { signal, ref: false }),
        ])
        if (code !== 0) throw new SiwcFault('configuration')
      } catch {
        signal.throwIfAborted()
        throw new SiwcFault('configuration')
      }
    },
  }
}
