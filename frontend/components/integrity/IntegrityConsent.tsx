'use client'

/**
 * Consent screen block for integrity checks: lists exactly the signals the
 * author switched on, in plain words, and what is (and is not) kept. The
 * candidate must tick the box before starting; the server also refuses
 * every event until consent is recorded for the attempt.
 */
import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { SIGNAL_INFO, type CandidateIntegrityConfig, type TargetKind } from '@/lib/integrity/types'
import { useT } from '@/lib/i18n/client'

export function useIntegrityConfig(kind: TargetKind, id: string | null | undefined, enabled = true) {
  const [config, setConfig] = useState<CandidateIntegrityConfig | null>(null)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(async () => {
    if (!id || !enabled) { setLoaded(true); return }
    try {
      const r = await fetch(`/api/integrity/config?kind=${kind}&id=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
      setConfig(r.ok ? ((await r.json()) as CandidateIntegrityConfig) : null)
    } catch {
      setConfig(null)
    } finally {
      setLoaded(true)
    }
  }, [kind, id, enabled])
  useEffect(() => { void load() }, [load])
  return { config, loaded, reload: load }
}

export function IntegrityConsent({ config, checked, onChange, id = 'integrity-consent' }: {
  config: CandidateIntegrityConfig
  checked: boolean
  onChange: (v: boolean) => void
  id?: string
}) {
  const { t } = useT()
  if (!config.enabled) return null
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />{' '}{t('exam.integrityChecksForThisTest')}</h2>
      <p className="text-muted-foreground">{t('exam.theOrganiserTurnedOnTheseChecksbb3')}</p>
      {config.signals.length > 0 ? (
        <ul className="space-y-1.5">
          {config.signals.map((s) => (
            <li key={s} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span><span className="font-medium text-foreground">{SIGNAL_INFO[s].label}.</span> <span className="text-muted-foreground">{SIGNAL_INFO[s].candidate}</span></span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground">
        {config.snapshots ? t('exam.ifTheCameraCheckSeesA636') : t('exam.noPhotosAreSavedByThesee58')}
        {config.continuous_video ? t('exam.thisTestAlsoRecordsYourWebcam1bc') : t('exam.noContinuousVideoIsRecordedBydb8')}
      </p>
      <p className="text-muted-foreground">{t('exam.nothingHereFailsYouAutomaticallyAe68')}</p>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 motion-reduce:transition-none">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring" />
        <span className="text-foreground">{t('exam.iUnderstandAndAgreeToTheseb72')}</span>
      </label>
    </section>
  )
}
