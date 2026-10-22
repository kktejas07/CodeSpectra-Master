'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { SHARE_KEYS, type ShareKey, type ShareSettings } from '@/lib/guardian/share'

interface Invite { learner_name: string; guardian_name: string; minor: boolean; share: ShareSettings; has_email: boolean; has_phone: boolean }

export function GuardianAcceptView({ token }: { token: string }) {
  const { t } = useT()
  const apiError = useApiError()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [state, setState] = useState<'loading' | 'invalid' | 'ready' | 'accepted' | 'declined'>('loading')
  const [code, setCode] = useState('')
  const [attest, setAttest] = useState(false)
  const [email, setEmail] = useState(true)
  const [whatsapp, setWhatsapp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    fetch(`/api/guardian/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => {
        if (!ok || !j.invite) { setState('invalid'); return }
        setInvite(j.invite)
        setEmail(!!j.invite.has_email)
        setWhatsapp(!j.invite.has_email && !!j.invite.has_phone)
        setState('ready')
      })
      .catch(() => setState('invalid'))
  }, [token])

  const shareLabel: Record<ShareKey, string> = {
    practice_time: t('account.grShare_practice'),
    tests: t('account.grShare_tests'),
    score_trend: t('account.grShare_trend'),
    streak: t('account.grShare_streak'),
    study_plan: t('account.grShare_plan'),
    drives: t('account.grShare_drives'),
  }

  const decide = async (decision: 'accept' | 'decline') => {
    setBusy(true)
    setError(null)
    try {
      const r = await csrfFetch('/api/guardian/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision, ...(decision === 'accept' ? { email, whatsapp, ...(invite?.minor ? { code, attest } : {}) } : {}) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(apiError(j))
      setState(decision === 'accept' ? 'accepted' : 'declined')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('account.waLoading')}</p>
  if (state === 'invalid') return <Panel><h1 className="text-xl font-semibold">{t('account.grInviteInvalidTitle')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('account.grInviteInvalidBody')}</p></Panel>
  if (state === 'accepted') return <Panel><h1 className="text-xl font-semibold">{t('account.grAcceptedTitle')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('account.grAcceptedBody', { name: invite?.learner_name || '' })}</p></Panel>
  if (state === 'declined') return <Panel><h1 className="text-xl font-semibold">{t('account.grDeclinedTitle')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('account.grDeclinedBody')}</p></Panel>

  const i = invite!
  const canAccept = (email || whatsapp) && (!i.minor || (attest && /^\d{6}$/.test(code)))
  return (
    <Panel className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 text-primary" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold">{t('account.grAcceptTitle', { name: i.learner_name })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('account.grAcceptIntro', { name: i.learner_name })}</p>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-medium">{t('account.grWhatIsShared')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {SHARE_KEYS.filter((k) => i.share[k]).map((k) => <li key={k}>{shareLabel[k]}</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t('account.grNeverShared')}</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{t('account.grHowToReceive')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {i.has_email && (
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={email} onChange={(e) => setEmail(e.target.checked)} />{t('account.grEmail')}
            </label>
          )}
          {i.has_phone && (
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />{t('account.grWhatsApp')}
            </label>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('account.grGuardianConsent')}</p>
      </fieldset>
      {i.minor && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">{t('account.grMinorVerify', { name: i.learner_name })}</p>
          <div className="space-y-1.5">
            <Label htmlFor="gr-code">{t('account.grCode')}</Label>
            <Input id="gr-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-40" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
            <span>{t('account.grAttest', { name: i.learner_name })}</span>
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide('accept')} disabled={busy || !canAccept}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{t('account.grAccept')}</Button>
        <Button variant="outline" onClick={() => decide('decline')} disabled={busy}>{t('account.grDecline')}</Button>
      </div>
    </Panel>
  )
}
