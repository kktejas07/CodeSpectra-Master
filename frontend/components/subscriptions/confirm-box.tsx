'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

export function ConfirmBox({ token }: { token: string }) {
  const { t } = useT()
  const apiError = useApiError()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(token ? 'idle' : 'error')
  const [msg, setMsg] = useState(token ? '' : t('public.subsConfirmMissing'))

  async function confirm() {
    setState('busy')
    try {
      const res = await csrfFetch('/api/subscriptions/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(d, t('public.subsConfirmFailed')))
      setState('done')
      setMsg(d.already ? t('public.subsConfirmAlready') : t('public.subsConfirmDone'))
    } catch (e) {
      setState('error')
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-8 text-center" role="status" aria-live="polite">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {state === 'done' ? <CheckCircle2 className="h-6 w-6" /> : <MailCheck className="h-6 w-6" />}
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{state === 'done' ? t('public.subsConfirmedTitle') : t('public.subsConfirmTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{msg || t('public.subsConfirmPrompt')}</p>
      <div className="mt-6 flex justify-center gap-3">
        {(state === 'idle' || state === 'busy') && (
          <Button onClick={confirm} disabled={state === 'busy'} className="h-11 rounded-xl px-6">
            {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} {t('public.subsConfirmButton')}
          </Button>
        )}
        <Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/events">{t('public.subsBrowseEvents')}</Link></Button>
      </div>
    </div>
  )
}
