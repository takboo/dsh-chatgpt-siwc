export type AccountStatus = 'connected' | 'identityOnly' | 'signedOut' | 'reauthorize'

export interface AccountView {
  id: string
  label: string
  status: AccountStatus
}

export interface ModelView {
  id: string
  name: string
}

export interface SettingsView {
  available: boolean
  authorizing: boolean
  accounts: AccountView[]
  active: string | null
  confirmPlan: boolean
  models: ModelView[] | null
}

export type SettingsAction =
  | { type: 'read' | 'cancel' | 'reload' | 'confirm' }
  | { type: 'login'; id?: string }
  | { type: 'activate' | 'logout'; id: string }

export type SettingsResult =
  | { ok: true; view: SettingsView; revocation?: 'confirmed' | 'unconfirmed' | 'localOnly' }
  | { ok: false; error: string }
