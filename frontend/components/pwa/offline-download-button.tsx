'use client'

/**
 * "Save for offline" on the daily challenge widget: stores today's question
 * (no answers) on this device so it can be solved without a connection at
 * /offline; the answer syncs and is graded when the device is back online.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, CloudDownload, Loader2 } from 'lucide-react'
import { offlineSupported, listPacks, downloadDailyChallenge } from '@/lib/pwa/offline-store'
import { cn } from '@/lib/utils'

export function OfflineDownloadButton({ day, className }: { day: string; className?: string }) {
  const [state, setState] = useState<'hidden' | 'idle' | 'saving' | 'saved' | 'error'>('hidden')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!offlineSupported()) return
    listPacks()
      .then((packs) => setState(packs.some((p) => p.key === `daily:${day}`) ? 'saved' : 'idle'))
      .catch(() => setState('idle'))
  }, [day])

  if (state === 'hidden') return null

  if (state === 'saved') {
    return (
      <Link
        href="/offline"
        className={cn('inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', className)}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-hidden /> Saved for offline
      </Link>
    )
  }

  const save = async () => {
    setState('saving')
    try {
      await downloadDailyChallenge()
      setState('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setState('error')
    }
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        onClick={save}
        disabled={state === 'saving'}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {state === 'saving'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          : <CloudDownload className="h-3.5 w-3.5" aria-hidden />}
        Save for offline
      </button>
      {state === 'error' && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  )
}
