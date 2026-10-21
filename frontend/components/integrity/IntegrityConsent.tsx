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
  if (!config.enabled) return null
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold text-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Integrity checks for this test
      </h2>
      <p className="text-muted-foreground">The organiser turned on these checks. They only run while you take the test.</p>
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
        {config.snapshots ? 'If the camera check sees a problem, one small still photo is saved for the reviewer and deleted later. ' : 'No photos are saved by these checks. '}
        {config.continuous_video ? 'This test also records your webcam and screen while you take it.' : 'No continuous video is recorded by these checks.'}
      </p>
      <p className="text-muted-foreground">Nothing here fails you automatically. A person reviews anything unusual before any decision.</p>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 motion-reduce:transition-none">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring" />
        <span className="text-foreground">I understand and agree to these checks.</span>
      </label>
    </section>
  )
}
