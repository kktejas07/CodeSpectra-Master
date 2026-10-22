'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

/** Confirm with a click (link scanners must not unsubscribe people by just opening the URL). */
export function GuardianUnsubscribeView({ linkId, token }: { linkId: string; token: string }) {
  const { t } = useT()
  const apiError = useApiError()
  const [state, setState] = useState<'ready' | 'busy' | 'done'>('ready')
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setState('busy')
    setError(null)
    try {
      const r = await csrfFetch('/api/guardian/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ l: linkId, t: token }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j))
      setState('done')
    } catch (e) {
      setError((e as Error).message)
      setState('ready')
    }
  }

  if (state === 'done') return <Panel><h1 className="text-xl font-semibold">{t('account.grUnsubDoneTitle')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('account.grUnsubDoneBody')}</p></Panel>
  return (
    <Panel className="space-y-4">
      <h1 className="text-xl font-semibold">{t('account.grUnsubTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('account.grUnsubBody')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={go} disabled={state === 'busy' || !linkId || !token}>{state === 'busy' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{t('account.grUnsubButton')}</Button>
    </Panel>
  )
}
