'use client'

/**
 * Cookie / tracking consent banner + settings panel (GDPR and India DPDP
 * friendly: off by default, specific per purpose, as easy to withdraw as to
 * give). Not shown while a browser privacy signal (DNT / GPC) decides for the
 * visitor, nor on private pages (test taking, token links, payment steps).
 *
 * Re-open from anywhere: an element with `data-cookie-settings`, a link to
 * `#cookie-settings`, or openConsentSettings() from lib/analytics/consent.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Cookie, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CONSENT_OPEN_EVENT, readSignals, saveConsent, type EffectiveConsent } from '@/lib/analytics/consent'

export function ConsentBanner({ consent, hidden }: { consent: EffectiveConsent; hidden?: boolean }) {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [analytics, setAnalytics] = useState(consent.analytics)
  const [marketing, setMarketing] = useState(consent.marketing)
  const [signal, setSignal] = useState(false)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const s = readSignals(navigator as never, window as never)
    setSignal(s.dnt || s.gpc)
  }, [])

  useEffect(() => { setAnalytics(consent.analytics); setMarketing(consent.marketing) }, [consent.analytics, consent.marketing])

  const openSettings = useCallback(() => { setDetails(true); setOpen(true) }, [])

  useEffect(() => {
    const onOpen = () => openSettings()
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-cookie-settings], a[href$="#cookie-settings"]')
      if (el) { e.preventDefault(); openSettings() }
    }
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    document.addEventListener('click', onClick)
    if (window.location.hash === '#cookie-settings') openSettings()
    return () => { window.removeEventListener(CONSENT_OPEN_EVENT, onOpen); document.removeEventListener('click', onClick) }
  }, [openSettings])

  useEffect(() => { if (open && details) panelRef.current?.focus() }, [open, details])

  const show = open || (!consent.decided && !hidden)
  if (!show) return null

  const choose = (a: boolean, m: boolean) => {
    saveConsent({ analytics: a, marketing: m })
    setOpen(false)
    setDetails(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape' && consent.decided) setOpen(false) }}
        className="pointer-events-auto w-full max-w-2xl rounded-3xl border border-border/70 bg-card p-5 text-card-foreground shadow-[0_18px_40px_-20px_rgba(15,23,41,0.35)] outline-none dark:shadow-none sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-foreground">Your privacy choices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We use essential cookies to sign you in and keep CodeSpectra secure. With your permission we&apos;d also like to
              measure how the site is used (analytics) and how our ads perform (marketing). Saying no doesn&apos;t change what you
              can do here, and you can change your mind any time from Cookie settings.{' '}
              <Link href="/cookies" className="font-medium text-primary underline-offset-4 hover:underline">Cookie policy</Link>
              {' · '}
              <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">Privacy policy</Link>
            </p>
          </div>
          {consent.decided && (
            <button type="button" aria-label="Close cookie settings" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {details && (
          <ul className="mt-4 space-y-3">
            <Choice title="Essential" desc="Sign-in, security, load balancing and anonymous page counts (no cookie, nothing that identifies you)." checked disabled />
            <Choice
              title="Analytics"
              desc="A random id on this device so we can see which pages and features help, and tools like Google Analytics, PostHog or Clarity if we use them."
              checked={analytics}
              onChange={setAnalytics}
            />
            <Choice
              title="Marketing"
              desc="Lets ad platforms (Meta, LinkedIn) know a visit or sign-up came from an ad."
              checked={marketing && !signal}
              onChange={setMarketing}
              disabled={signal}
              note={signal ? 'Your browser asks sites not to track you (Global Privacy Control / Do Not Track), so this stays off.' : undefined}
            />
          </ul>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!details && (
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setDetails(true)}>Choose</Button>
          )}
          <Button type="button" variant="outline" className="min-h-11" onClick={() => choose(false, false)}>Essential only</Button>
          {details ? (
            <Button type="button" className="min-h-11" onClick={() => choose(analytics, marketing && !signal)}>Save choices</Button>
          ) : (
            <Button type="button" className="min-h-11" onClick={() => choose(true, !signal)}>Accept all</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Choice({ title, desc, checked, onChange, disabled, note }: { title: string; desc: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; note?: string }) {
  const id = useId()
  return (
    <li className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">{title}</label>
        <p className="text-xs text-muted-foreground">{desc}</p>
        {note && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{note}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange?.(v === true)} />
    </li>
  )
}
