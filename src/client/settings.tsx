import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Button, IconCheckOutlineRegular, IconEllipsisOutlineRegular, IconGlobeOutlineRegular,
  IconInfoOutlineRegular, IconPlusOutlineRegular, Menu, Switch, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigForms } from '@deepseek-ai/dsh-client-ui-settings/client'
import { providerId } from '../identity.js'
import type { AccountView, SettingsAction, SettingsResult, SettingsView } from '../view.js'
import { en, zh } from './locale.js'
import type { TextKey, Translate } from './locale.js'
import { UsageLink } from './usage.js'

type Command = (action: SettingsAction) => Promise<SettingsResult>

const layout = {
  panel: {
    display: 'grid',
    color: 'var(--dsw-alias-label-primary, inherit)',
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  note: { margin: 0, color: 'var(--dsw-alias-label-secondary, inherit)', fontSize: 13, lineHeight: 1.5 },
  list: { margin: 0, padding: 0, listStyle: 'none' },
  item: { borderBlockStart: '1px solid var(--dsw-alias-border-l3, #d8dddb)', paddingBlock: 8, minHeight: 48, boxSizing: 'border-box' },
  heading: { margin: 0, fontWeight: 600, fontSize: 14 },
  avatar: {
    display: 'inline-grid', placeItems: 'center', flex: 'none', width: 32, height: 32, borderRadius: '50%',
    background: 'light-dark(#e3efeb, #28423d)', color: 'light-dark(#23574d, #b9ddd3)', fontSize: 12, fontWeight: 600,
  },
} as const

const statusTone = { identityOnly: 'warning', signedOut: 'neutral', reauthorize: 'warning' } as const

function AccountRow({ account, t, active, canEdit, available, run }: {
  account: AccountView; t: Translate; active: boolean; canEdit: boolean; available: boolean
  run: (action: SettingsAction) => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const name = account.displayName ?? t('unnamedAccount')
  const initial = Array.from(name)[0]?.toLocaleUpperCase()
  const connected = account.status === 'connected'
  return <li style={{ ...layout.item, ...layout.row, flexWrap: 'nowrap' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span aria-hidden="true" style={layout.avatar}>{initial}</span>
      <div style={{ ...layout.actions, minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</span>
        {active && connected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
          fontSize: 11, color: 'var(--dsw-alias-state-success-primary)' }}>
          <IconCheckOutlineRegular size={12} />{t('active')}
        </span>}
        {account.status !== 'connected' && <Tag tone={statusTone[account.status]}>{t(account.status)}</Tag>}
      </div>
    </div>
    <div style={{ ...layout.actions, flexWrap: 'nowrap', flexShrink: 0 }}>
      {available && connected && !active &&
        <Button size="sm" disabled={!canEdit} onClick={() => void run({ type: 'activate', id: account.id })}>{t('activate')}</Button>}
      {available && !connected &&
        <Button size="sm" disabled={!canEdit} onClick={() => void run({ type: 'login', id: account.id })}>{t('reauthenticate')}</Button>}
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} align="end" portal compact
        anchor={<Button type="button" size="sm" aria-haspopup="menu" aria-expanded={menuOpen}
          aria-label={`${t('accountActions')} · ${name}`} onClick={() => setMenuOpen(open => !open)}
          icon={<IconEllipsisOutlineRegular size={16} />} />}
        items={[
          { type: 'label', id: 'registration-label', text: t('accountId') },
          { type: 'label', id: 'registration-id', text: account.id },
          ...(available && account.status !== 'signedOut'
            ? [{ id: 'logout', label: t('logout'), disabled: !canEdit, danger: true }] : []),
        ]}
        onSelect={item => { if (item === 'logout') void run({ type: 'logout', id: account.id }) }}
      />
    </div>
  </li>
}

function SearchSettings({ t, forms, connected }: { t: Translate; forms: ConfigForms; connected: boolean }) {
  const plugin = forms.get<{ enableChatGptSearch?: boolean }>(providerId)
  const web = forms.get<{ searchProvider?: string }>('web')
  const settings = useSyncExternalStore(listener => plugin.subscribe(listener), () => plugin.getSnapshot())
  const selection = useSyncExternalStore(listener => web.subscribe(listener), () => web.getSnapshot())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const enabled = settings.value?.enableChatGptSearch === true
  const selected = selection.value?.searchProvider === providerId
  if (settings.status !== 'ready' || selection.status !== 'ready') return null
  const update = async (write: () => Promise<boolean>) => {
    setBusy(true)
    setFailed(false)
    try { setFailed(!await write()) }
    catch { setFailed(true) }
    finally { setBusy(false) }
  }
  const toggle = async (next: boolean) => {
    if (!next && selected && !await web.unset('searchProvider')) return false
    return plugin.set('enableChatGptSearch', next)
  }
  return <div style={{ ...layout.row, ...layout.item }}>
    <div style={{ ...layout.actions, flexWrap: 'nowrap', fontSize: 13 }}>
      <span style={layout.note}><IconGlobeOutlineRegular size={16} /></span>
      <span>{t('enableSearch')}</span>
      <Tooltip label={t('searchHelp')} side="top" delayMs={250} maxWidth={310} portal openOnClick>
        <Button type="button" size="sm" aria-label={t('searchHelpLabel')}
          style={{ paddingInline: 4, color: 'var(--dsw-alias-label-secondary)' }}
          icon={<IconInfoOutlineRegular size={14} />} />
      </Tooltip>
    </div>
    <div style={{ ...layout.actions, marginInlineStart: 'auto' }}>
      {enabled && selected && <span style={{ ...layout.note, fontSize: 11 }}>{t('searchSelected')}</span>}
      {enabled && <Button size="sm" disabled={busy || !selection.writable || (!selected && !connected)}
        onClick={() => void update(() => selected ? web.unset('searchProvider') : web.set('searchProvider', providerId))}>
        {t(selected ? 'restoreSearch' : 'selectSearch')}
      </Button>}
      <Switch label={t('enableSearch')} checked={enabled} disabled={busy || !settings.writable || (selected && !selection.writable)}
        onChange={next => { void update(() => toggle(next)) }} />
    </div>
    {failed && <p role="alert" style={{ ...layout.note, flexBasis: '100%' }}>{t('searchSaveFailed')}</p>}
  </div>
}

export function SettingsPanel({ t, command, forms }: { t: Translate; command: Command; forms?: ConfigForms }) {
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

  return (
    <section aria-label={t('account')} style={layout.panel}>
      <div style={{ ...layout.row, paddingBlockEnd: 6 }}>
        <h2 style={layout.heading}>{t('account')}</h2>
        {view?.available && (authorizing
          ? <Button size="sm" variant="outline" onClick={() => void run({ type: 'cancel' })}>{t('cancel')}</Button>
          : <Button size="sm" variant={view.accounts.length ? 'outline' : 'primary'} disabled={!canEdit}
            icon={view.accounts.length ? <IconPlusOutlineRegular size={14} /> : undefined}
            onClick={() => void run({ type: 'login' })}>
            {t(view.accounts.length ? 'addAccount' : 'signIn')}
          </Button>)}
      </div>
      {!view && pending && <p role="status" style={layout.note}>{t('loading')}</p>}
      {view && !view.available && <p style={layout.note}>{t('offline')}</p>}
      {view?.available && !active && view.accounts.length === 0 && <p style={layout.note}>{t('emptyAccounts')}</p>}
      {notice && <div role={notice.error ? 'alert' : 'status'} style={{ ...layout.actions, ...layout.note }}>
        {t(notice.message)}
        {quota && <UsageLink t={t} />}
      </div>}
      {view?.accounts.length ? <ul style={layout.list} aria-label={t('savedAccounts')}>
        {view.accounts.map(account => <AccountRow key={account.id} account={account} t={t}
          active={account.id === view.active} canEdit={canEdit} available={view.available} run={run} />)}
      </ul> : null}
      {view?.confirmPlan && <div style={layout.row}>
        <p style={layout.note}>{t('planConfirmation')}</p>
        <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => void run({ type: 'confirm' })}>{t('confirm')}</Button>
      </div>}
      {view?.available && forms && <SearchSettings t={t} forms={forms} connected={!!active} />}
    </section>
  )
}

export const settingsLocale = { en, zh }
