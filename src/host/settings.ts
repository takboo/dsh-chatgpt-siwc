import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsService } from '../remote.js'
import type { SettingsResult } from '../view.js'
import type { Accounts } from './accounts.js'
import { SiwcFault } from './oauth.js'
import { actionSchema } from '../schema.js'

export class Settings extends TypertRemoteService {
  constructor(ctx: Context, private readonly accounts: Accounts) {
    super(ctx, settingsService)
  }

  async settings(input: unknown): Promise<SettingsResult> {
    const call = this.ctx.invocation
    if (call?.peer.principal.kind !== 'owner' || call.signal.aborted) return { ok: false, error: 'permission' }
    const parsed = actionSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'configuration' }
    const action = parsed.data
    try {
      switch (action.type) {
        case 'cancel': await this.accounts.cancel(); break
        case 'login': await this.accounts.login(action.id, call.signal); break
        case 'activate': await this.accounts.activate(action.id); break
        case 'confirm': await this.accounts.confirm(); break
        case 'reload': await this.accounts.models(true, call.signal); break
        case 'logout': {
          const revocation = await this.accounts.logout(action.id)
          return { ok: true, view: await this.accounts.view(), revocation }
        }
      }
      return { ok: true, view: await this.accounts.view() }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof SiwcFault ? error.code : call.signal.aborted ? 'cancelled' : 'storage',
      }
    }
  }
}
