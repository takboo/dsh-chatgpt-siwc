import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createElement } from 'react'
import { SettingsPanel, settingsLocale } from './client/settings.js'
import type { Translate } from './client/locale.js'
import { ComposerUsage } from './client/usage.js'
import { packageName, providerId } from './identity.js'
import { settingsDescriptor, settingsService } from './remote.js'
import type { SettingsAction, SettingsResult } from './view.js'

export const name = providerId
export const inject = ['locale', 'slots', 'remote']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    [providerId]: Parameters<Translate>[0]
  }
}

export function apply(ctx: Context): void {
  const remote = ctx.remote.$mount({ package: packageName, descriptors: [settingsDescriptor] })
  const ready = remote.then(() => true, () => false)
  ctx.effect(() => async () => {
    const dispose = await remote.catch(() => undefined)
    await dispose?.()
  })
  const command = async (action: SettingsAction): Promise<SettingsResult> => {
    if (!await ready) return { ok: false, error: 'unknown' }
    const service = ctx.get(`remote.${settingsService}`) as {
      settings(input: SettingsAction): Promise<RemoteResult<SettingsResult>>
    } | undefined
    if (!service) return { ok: false, error: 'unknown' }
    const result = await service.settings(action)
    return result.ok ? result.value : { ok: false, error: 'unknown' }
  }
  ctx.effect(() => ctx.locale.register(providerId, settingsLocale))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: packageName,
    locale: providerId,
  }, ({ t }) => createElement(SettingsPanel, { t, command, forms: ctx.get('configForms') })))
  ctx.inject(['modelDirectories'], child => {
    const models = child.modelDirectories
    child.slots.inject('conversation.input.right', () => child.slots.register({
      name: 'conversation.input.right',
      id: providerId,
      locale: providerId,
      inject: sessionId => ({ directory: models.directoryFor(sessionId as SessionId) }),
    }, ComposerUsage))
  })
}
