'use client'

/**
 * Learner landing for an LTI launch: sign in (same email as the LMS), then
 * continue to the linked CodeSpectra test. The result goes back to the LMS
 * gradebook when it is released.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n/client'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { call, ErrorNote, Skeleton, useErrorText } from '@/components/community/client-api'

type Summary = { exam: { id: string; title: string } | null; email: string | null; name: string | null; context: string | null }

export default function LtiLaunchPage() {
  const { t } = useT()
  const { token = '' } = useParams<{ token: string }>()
  const auth = useAuth()
  const errText = useErrorText()
  const [s, setS] = useState<Summary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signedIn = !!auth.user
  useEffect(() => {
    if (!signedIn) return
    call<Summary>(`/api/lti/launches/${encodeURIComponent(token)}`).then(setS).catch((e) => setErr(errText(e)))
  }, [signedIn, token, errText])
  const go = async () => {
    setBusy(true)
    try {
      const r = await call<{ url: string }>(`/api/lti/launches/${encodeURIComponent(token)}`, { body: {} })
      window.location.href = r.url
    } catch (e) { setErr(errText(e)); setBusy(false) }
  }
  return (
    <div className="mx-auto w-full max-w-xl">
      <Panel className="space-y-4 p-6">
        <p className="flex items-center gap-2 text-lg font-semibold text-foreground"><GraduationCap className="h-5 w-5 text-primary" aria-hidden />{t('community.ltiLandingTitle')}</p>
        {!signedIn ? (
          <>
            <p className="text-sm text-muted-foreground">{t('community.ltiSignInFirst')}</p>
            <Button asChild className="min-h-[44px] rounded-full"><Link href={`/auth/login?redirect=${encodeURIComponent(`/lti/launch/${token}`)}`}>{t('community.signIn')}</Link></Button>
          </>
        ) : !s && !err ? <Skeleton className="h-24" /> : (
          <>
            {s && (
              <div className="space-y-1 text-sm">
                {s.context && <p className="text-muted-foreground">{t('community.ltiFromCourse', { course: s.context })}</p>}
                <p className="text-foreground">{s.exam ? t('community.ltiTestIs', { title: s.exam.title }) : t('community.err_lti_no_exam')}</p>
                {s.email && <p className="text-muted-foreground">{t('community.ltiEmailNote', { email: s.email })}</p>}
              </div>
            )}
            <ErrorNote text={err} />
            {s?.exam && <Button className="min-h-[44px] rounded-full" disabled={busy} onClick={go}>{t('community.ltiContinue')}</Button>}
          </>
        )}
      </Panel>
    </div>
  )
}
