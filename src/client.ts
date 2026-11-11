import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createElement } from 'react'
import { packageName, providerId } from './identity.js'

export const name = providerId
export const inject = ['locale', 'slots']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [providerId]: 'signInUnavailable'
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(providerId, {
    en: { signInUnavailable: 'ChatGPT sign-in is unavailable in this build.' },
    zh: { signInUnavailable: '此构建暂未开放 ChatGPT 登录。' },
  }))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: packageName,
    locale: providerId,
  }, ({ t }) => createElement('p', { role: 'status' }, t('signInUnavailable'))))
}
