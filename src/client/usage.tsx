import { useSyncExternalStore } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectory } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { providerId } from '../identity.js'
import type { Translate } from './locale.js'

const usageUrl = 'https://chatgpt.com/settings/usage'

export function UsageLink({ t, composer = false }: { t: Translate; composer?: boolean }) {
  const link = <a href={usageUrl} target="_blank" rel="noopener noreferrer"
    style={{ display: 'inline-flex', gap: 5, alignItems: 'center', whiteSpace: 'nowrap',
      color: 'var(--dsw-alias-label-secondary, inherit)', fontSize: 12 }}>
    {t('manage')} <span aria-hidden="true">↗</span>
  </a>
  return composer ? <Tooltip label={t('usingPlan')} portal side="top">{link}</Tooltip> : link
}

export function ComposerUsage({ directory, t }: { directory: ModelDirectory; t: Translate }) {
  const current = useSyncExternalStore(listener => directory.store.subscribe(listener), () => directory.store.getSnapshot().current)
  return current?.provider === providerId ? <UsageLink t={t} composer /> : null
}
