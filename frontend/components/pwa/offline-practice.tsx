'use client'

/**
 * Offline practice (/offline): questions saved on this device, a plain code
 * editor with autosaved drafts, and answers queued until the connection is
 * back (then POSTed to /api/submissions and graded on the server as usual).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CloudOff, Send, Trash2, Wifi } from 'lucide-react'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { QueuedSubmission } from '@/lib/pwa/core'
import type { OfflinePack } from '@/lib/pwa/offline-payload'
import { queueStatusLabel } from '@/lib/pwa/offline-queue'
import {
  OFFLINE_EVENT, enqueueSubmission, flushOfflineQueue, getDraft, listPacks, listQueue, offlineSupported, removeQueued, saveDraft,
} from '@/lib/pwa/offline-store'

const FALLBACK_LANGS = ['python', 'javascript', 'java', 'cpp']

function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function OfflinePractice() {
  const online = useOnline()
  const [supported, setSupported] = useState(true)
  const [loading, setLoading] = useState(true)
  const [packs, setPacks] = useState<OfflinePack[]>([])
  const [queue, setQueue] = useState<QueuedSubmission[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [p, q] = await Promise.all([listPacks(), listQueue()])
      setPacks(p)
      setQueue(q)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!offlineSupported()) { setSupported(false); setLoading(false); return }
    void refresh()
    const on = () => void refresh()
    window.addEventListener(OFFLINE_EVENT, on)
    return () => window.removeEventListener(OFFLINE_EVENT, on)
  }, [refresh])

  const open = packs.find((p) => p.key === openKey) || null
  const waiting = queue.filter((q) => q.state !== 'synced' && q.state !== 'rejected').length

  const syncNow = async () => {
    setSyncing(true)
    try { await flushOfflineQueue() } finally { setSyncing(false); void refresh() }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        icon={<CloudOff aria-hidden />}
        title="Offline practice"
        description="Questions you saved on this device. Answers are sent and graded when you are back online."
        actions={
          <span
            role="status"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              online ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
            )}
          >
            {online ? <Wifi className="h-3.5 w-3.5" aria-hidden /> : <CloudOff className="h-3.5 w-3.5" aria-hidden />}
            {online ? 'Online' : 'Offline'}
          </span>
        }
      />

      {!online && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          You are offline. Pages that need your account will open again when the connection is back.
        </p>
      )}

      {!supported ? (
        <EmptyState compact title="Offline practice is not available in this browser" description="Use a recent version of Chrome, Edge, Safari or Firefox." />
      ) : loading ? (
        <p className="text-sm text-muted-foreground" role="status">Loading saved questions…</p>
      ) : open ? (
        <PackSolver pack={open} onBack={() => setOpenKey(null)} onQueued={() => void refresh()} />
      ) : packs.length === 0 ? (
        <EmptyState
          compact
          title="Nothing saved yet"
          description="On your dashboard, tap Save for offline on the daily challenge. It will be here even without a connection."
          actionLabel={online ? 'Go to dashboard' : undefined}
          actionHref={online ? '/dashboard' : undefined}
        />
      ) : (
        <ul className="grid gap-3">
          {packs.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => setOpenKey(p.key)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-primary">Daily challenge · <span className="tabular-nums">{p.day}</span></span>
                  <span className="block truncate font-semibold text-foreground">{p.problem.title}</span>
                  <span className="block text-xs capitalize text-muted-foreground">{p.problem.difficulty}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-primary">Open</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {queue.length > 0 && (
        <section aria-labelledby="queue-title" className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="queue-title" className="font-semibold text-foreground">Your answers</h2>
            {waiting > 0 && online && (
              <Button size="sm" variant="outline" className="min-h-10 rounded-lg" disabled={syncing} onClick={syncNow}>
                {syncing ? 'Sending…' : 'Send now'}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{q.title}</p>
                  <p className={cn('text-xs', q.state === 'rejected' ? 'text-destructive' : q.state === 'synced' && q.result?.status === 'accepted' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                    {q.body.language} · <time dateTime={new Date(q.created_at).toISOString()}>{new Date(q.created_at).toLocaleString()}</time> · {queueStatusLabel(q)}
                  </p>
                </div>
                {(q.state === 'synced' || q.state === 'rejected') && (
                  <button
                    type="button"
                    onClick={() => void removeQueued(q.id)}
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Remove ${q.title} from this list`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {online && (
        <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
        </Link>
      )}
    </div>
  )
}

function PackSolver({ pack, onBack, onQueued }: { pack: OfflinePack; onBack: () => void; onQueued: () => void }) {
  const p = pack.problem
  const langs = useMemo(() => {
    const ks = Object.keys(p.starter_code)
    return ks.length ? ks : FALLBACK_LANGS
  }, [p.starter_code])
  const [language, setLanguage] = useState(langs[0])
  const [code, setCode] = useState(p.starter_code[langs[0]] || '')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    getDraft(pack.key).then((d) => {
      if (d && langs.includes(d.language)) { setLanguage(d.language); setCode(d.code) }
      loaded.current = true
    }).catch(() => { loaded.current = true })
  }, [pack.key, langs])

  useEffect(() => {
    if (!loaded.current) return
    const t = window.setTimeout(() => { void saveDraft(pack.key, language, code) }, 500)
    return () => window.clearTimeout(t)
  }, [pack.key, language, code])

  const changeLanguage = (next: string) => {
    // Switch to that language's starter code unless the learner already typed something.
    if (code.trim() === (p.starter_code[language] || '').trim()) setCode(p.starter_code[next] || '')
    setLanguage(next)
  }

  const submit = async () => {
    const r = await enqueueSubmission(pack, language, code)
    if (!r.ok) { setMessage({ kind: 'error', text: r.error }); return }
    setMessage({ kind: 'ok', text: navigator.onLine ? 'Sending your answer…' : 'Saved. It will be sent and graded when you are back online.' })
    onQueued()
  }

  return (
    <article className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All saved questions
      </button>
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-primary">Daily challenge · <span className="tabular-nums">{pack.day}</span> · <span className="capitalize">{p.difficulty}</span></p>
        <h2 className="mt-1 text-xl font-semibold text-foreground">{p.title}</h2>
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{p.statement_md}</div>
        {p.input_format && <Section title="Input">{p.input_format}</Section>}
        {p.output_format && <Section title="Output">{p.output_format}</Section>}
        {p.constraints && <Section title="Constraints">{p.constraints}</Section>}
        {p.samples.map((s, i) => (
          <div key={i} className="mt-4 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Sample input {i + 1}</p>
              <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs text-foreground">{s.stdin}</pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Sample output {i + 1}</p>
              <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs text-foreground">{s.expected_stdout}</pre>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="offline-lang">Language</Label>
          <select
            id="offline-lang"
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {langs.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">Your draft is saved on this device as you type.</span>
        </div>
        <Label htmlFor="offline-code" className="sr-only">Your code</Label>
        <textarea
          id="offline-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={16}
          className="w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Tests run on our servers, so results appear once your answer is sent.</p>
          <Button className="min-h-11 gap-1.5 rounded-lg" onClick={submit}>
            <Send className="h-4 w-4" aria-hidden /> Submit answer
          </Button>
        </div>
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', message.kind === 'error' ? 'text-destructive' : 'text-foreground')}>
            {message.text}
          </p>
        )}
      </div>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
