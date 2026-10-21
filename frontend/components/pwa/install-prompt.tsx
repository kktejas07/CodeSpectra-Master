'use client'

/**
 * "Install the app" card for signed-in users. Shown from the second day of
 * use (not on a first visit), hidden for 30 days after "Not now", never in
 * the installed app. Android / desktop Chrome & Edge use the browser's
 * install prompt; iOS Safari gets Add to Home Screen steps.
 */
import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIos, isStandalone } from '@/lib/pwa/push-client'
import {
  clearInstallPrompt, getInstallPrompt, INSTALL_EVENT, readEngagement, recordVisit, shouldShowInstall, writeEngagement,
} from './install-state'
import { useT } from '@/lib/i18n/client'

export function InstallPrompt() {
  const { t: tr } = useT()
  const [mode, setMode] = useState<'prompt' | 'ios' | null>(null)
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    if (isStandalone()) {
      writeEngagement({ ...readEngagement(), installed: true })
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const e = recordVisit(readEngagement(), today)
    writeEngagement(e)
    const decide = () => {
      if (!shouldShowInstall(readEngagement(), Date.now())) { setMode(null); return }
      if (getInstallPrompt()) setMode('prompt')
      else if (isIos()) setMode('ios')
      else setMode(null)
    }
    // Give the page a moment before asking for anything.
    const t = window.setTimeout(decide, 20_000)
    window.addEventListener(INSTALL_EVENT, decide)
    return () => { window.clearTimeout(t); window.removeEventListener(INSTALL_EVENT, decide) }
  }, [])

  if (!mode) return null

  const dismiss = () => {
    writeEngagement({ ...readEngagement(), dismissedAt: Date.now() })
    setMode(null)
  }

  const install = async () => {
    const p = getInstallPrompt()
    if (!p) { setMode(null); return }
    await p.prompt()
    const choice = await p.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
    clearInstallPrompt()
    if (choice.outcome === 'accepted') writeEngagement({ ...readEngagement(), installed: true })
    else writeEngagement({ ...readEngagement(), dismissedAt: Date.now() })
    setMode(null)
  }

  return (
    <section
      aria-labelledby="cs-install-title"
      className="cs-pwa-float fixed left-4 right-4 z-40 mx-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:left-auto sm:right-20 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id="cs-install-title" className="text-sm font-semibold text-foreground">{tr('dash.installTheCodespectraApp')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr('dash.openPracticeAndContestsFromYourd77')}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 -mt-1 flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={tr('dash.notNow')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === 'ios' && showSteps && (
        <ol className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3 text-sm text-foreground">
          <li className="flex items-center gap-2">
            <span className="tabular-nums text-muted-foreground">1.</span>{tr('dash.tap')}{' '}<Share className="h-4 w-4 text-primary" aria-label={tr('dash.share')} />{' '}{tr('dash.inSafarisToolbar')}</li>
          <li className="flex items-center gap-2">
            <span className="tabular-nums text-muted-foreground">2.</span>{tr('dash.choose')}{' '}<SquarePlus className="h-4 w-4 text-primary" aria-hidden />{' '}{tr('dash.addToHomeScreen')}</li>
          <li className="flex items-center gap-2">
            <span className="tabular-nums text-muted-foreground">3.</span>{tr('dash.tapAddThenOpenCodespectraFromaf0')}</li>
        </ol>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="min-h-10 rounded-lg" onClick={dismiss}>{tr('dash.notNow')}</Button>
        {mode === 'prompt' ? (
          <Button size="sm" className="min-h-10 gap-1.5 rounded-lg" onClick={install}>
            <Download className="h-4 w-4" aria-hidden />{' '}{tr('dash.install')}</Button>
        ) : (
          <Button size="sm" className="min-h-10 rounded-lg" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
            {showSteps ? tr('dash.hideSteps') : tr('dash.howToInstall')}
          </Button>
        )}
      </div>
    </section>
  )
}
