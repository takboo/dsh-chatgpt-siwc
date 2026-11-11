import { useEffect, useRef, useState } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsAction, SettingsResult, SettingsView } from '../view.js'
import { en, zh } from './locale.js'

type TextKey = keyof typeof en
export type Translate = (key: TextKey) => string
type Command = (action: SettingsAction) => Promise<SettingsResult>

const layout = {
  panel: {
    display: 'grid', gap: 14, borderRadius: 'var(--dsw-radius-md, 12px)', padding: 14,
    border: '1px solid var(--dsw-alias-settings-card-stroke, #d8dddb)',
    borderInlineStart: '3px solid light-dark(#387e6f, #78bca9)',
    background: 'var(--dsw-alias-settings-card-fill, transparent)',
    color: 'var(--dsw-alias-label-primary, inherit)',
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  note: { margin: 0, color: 'var(--dsw-alias-label-secondary, inherit)', fontSize: 13, lineHeight: 1.5 },
  list: { display: 'grid', gap: 8, margin: 0, padding: 0, listStyle: 'none' },
  item: { borderTop: '1px solid var(--dsw-alias-border-l3, #d8dddb)', paddingTop: 8 },
  heading: { margin: 0, fontWeight: 600, fontSize: 14 },
  wrap: { overflowWrap: 'anywhere' },
  limitEdge: { borderInlineStartColor: 'light-dark(#a5640e, #efb363)' },
  primaryLink: {
    display: 'inline-flex', alignItems: 'center', minHeight: 36, paddingInline: 14,
    borderRadius: 'var(--dsw-radius-md, 12px)', textDecoration: 'none',
    color: 'var(--dsw-alias-label-primary-foreground, white)',
    background: 'var(--dsw-alias-button-primary-fill, #123a43)',
  },
} as const

const statusTone = { connected: 'success', identityOnly: 'warning', signedOut: 'neutral', reauthorize: 'warning' } as const

export function SettingsPanel({ t, command }: { t: Translate; command: Command }) {
  const [view, setView] = useState<SettingsView>()
  const [pending, setPending] = useState<SettingsAction['type'] | null>(null)
  const [notice, setNotice] = useState<{ message: TextKey; error: boolean }>()
  const sequence = useRef(0)
  const busy = useRef(false)
  const run = async (action: SettingsAction) => {
    if (busy.current && action.type !== 'cancel') return
    const runId = ++sequence.current
    busy.current = true
    setPending(action.type)
    setNotice(undefined)
    try {
      const result = await command(action)
      if (sequence.current !== runId) return
      if (result.ok) {
        setView(result.view)
        if (result.revocation) setNotice({ message: result.revocation, error: result.revocation === 'unconfirmed' })
      } else {
        const key = `error_${result.error}`
        const message = Object.hasOwn(en, key) ? key as TextKey : 'error_unknown'
        setNotice({ message, error: result.error !== 'cancelled' })
        const fresh = await command({ type: 'read' })
        if (sequence.current === runId && fresh.ok) setView(fresh.view)
      }
    } catch {
      if (sequence.current === runId) setNotice({ message: 'error_unknown', error: true })
    } finally {
      if (sequence.current === runId) {
        busy.current = false
        setPending(null)
      }
    }
  }

  useEffect(() => {
    void run({ type: 'read' })
    return () => { sequence.current += 1; busy.current = false }
    // The command belongs to the mounted settings contribution.
  }, [command])

  const active = view?.accounts.find(account => account.id === view.active)
  const authorizing = view?.authorizing || pending === 'login'
  const canEdit = pending === null
  const quota = notice?.message === 'error_quota'
  const showUsage = active || quota || notice?.message === 'unconfirmed'

  return (
    <section aria-label={t('account')} style={quota ? { ...layout.panel, ...layout.limitEdge } : layout.panel}>
      <div style={layout.row}>
        <h2 style={layout.heading}>{t('account')}</h2>
        {active && <Tag tone="success">{t('usingPlan')}</Tag>}
      </div>
      {!view && pending && <p role="status" style={layout.note}>{t('loading')}</p>}
      {view && !view.available && <p style={layout.note}>{t('offline')}</p>}
      {view?.available && !active && view.accounts.length === 0 && <p style={layout.note}>{t('emptyAccounts')}</p>}
      {notice && !quota && <p role={notice.error ? 'alert' : 'status'} style={layout.note}>{t(notice.message)}</p>}
      {view?.accounts.length ? <ul style={layout.list} aria-label={t('savedAccounts')}>
        {view.accounts.map(account => <li key={account.id} style={{ ...layout.row, ...layout.item }}>
          <div style={layout.actions}>
            <strong style={layout.wrap}>{account.label}</strong>
            <Tag tone={account.id === view.active ? 'success' : statusTone[account.status]}>
              {t(account.id === view.active ? 'active' : account.status)}
            </Tag>
          </div>
          {view.available && <div style={layout.actions}>
            {account.id !== view.active && account.status === 'connected' &&
              <Button size="sm" disabled={!canEdit} onClick={() => void run({ type: 'activate', id: account.id })}>{t('activate')}</Button>}
            {(account.status === 'signedOut' || account.status === 'reauthorize' || account.status === 'identityOnly') &&
              <Button size="sm" disabled={!canEdit} onClick={() => void run({ type: 'login', id: account.id })}>{t('reauthenticate')}</Button>}
            {account.status !== 'signedOut' &&
              <Button size="sm" disabled={!canEdit} onClick={() => void run({ type: 'logout', id: account.id })}>{t('logout')}</Button>}
          </div>}
        </li>)}
      </ul> : null}
      {view?.confirmPlan && <div style={layout.row}>
        <p style={layout.note}>{t('planConfirmation')}</p>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => void run({ type: 'confirm' })}>{t('confirm')}</Button>
      </div>}
      {showUsage && <div style={{ ...layout.row, ...layout.item }}>
        <div>
          <h3 style={layout.heading}>{t('usage')}</h3>
          {quota && <p role="alert" style={layout.note}>{t('error_quota')}</p>}
        </div>
        <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" style={quota ? layout.primaryLink : undefined}>{t('manage')}</a>
      </div>}
      {active && <div style={{ ...layout.row, ...layout.item }}>
        <div>
          <h3 style={layout.heading}>{t('models')}</h3>
          {quota ? null : view?.models?.length ? (
            <details style={layout.note}>
              <summary>{t('modelCount').replace('{count}', String(view.models.length))}</summary>
              <ul style={{ ...layout.list, maxHeight: 160, overflowY: 'auto', marginBlockStart: 6 }}>
                {view.models.map(model => <li key={model.id} style={layout.wrap}>{model.name}</li>)}
              </ul>
            </details>
          ) : <p style={layout.note}>{view?.models === null ? t('loadModels') : t('emptyModels')}</p>}
        </div>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => void run({ type: 'reload' })}>{t('reload')}</Button>
      </div>}
      {view?.available && <div style={layout.actions}>
        {authorizing
          ? <Button variant="outline" onClick={() => void run({ type: 'cancel' })}>{t('cancel')}</Button>
          : view?.available && <Button variant={view.accounts.length ? 'ghost' : 'primary'} disabled={!canEdit} onClick={() => void run({ type: 'login' })}>
            {t(view.accounts.length ? 'addAccount' : 'signIn')}
          </Button>}
      </div>}
    </section>
  )
}

export const settingsLocale = { en, zh }
