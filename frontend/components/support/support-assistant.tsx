'use client'

/**
 * In-app help assistant (lib/assistants/support) on /dashboard/support. Shown
 * only when Admin → Assistants has it on. Answers come from the help centre and
 * the user's own records; any answer can become a support ticket.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bot, LifeBuoy, Loader2, Send, Ticket, Trash2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { useToast } from '@/lib/toast-context'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Result { n: number; title: string; url: string }
interface Answer { mode: 'ai' | 'fallback'; fallback: string | null; answer: string | null; facts: string[]; cited: number[]; results: Result[]; escalate: boolean; answer_id?: string | null }
type Turn = { id: number; role: 'user'; text: string } | { id: number; role: 'assistant'; q: string; a: Answer; ticket?: 'busy' | 'done' }

export function SupportAssistant({ onTicketCreated }: { onTicketCreated?: () => void }) {
  const { t, locale } = useT()
  const apiError = useApiError()
  const addToast = useToast()
  const [status, setStatus] = useState<{ enabled: boolean; ai: boolean } | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const endRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    let live = true
    fetch('/api/support/assistant', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setStatus(d ? { enabled: !!d.enabled, ai: !!d.ai } : { enabled: false, ai: false }) })
      .catch(() => { if (live) setStatus({ enabled: false, ai: false }) })
    return () => { live = false }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy])

  const ask = useCallback(async () => {
    const text = q.trim()
    if (text.length < 2 || busy) return
    setBusy(true)
    setError(null)
    const history = turns.slice(-6).map((x) => (x.role === 'user' ? { role: 'user' as const, text: x.text } : { role: 'assistant' as const, text: x.a.answer || x.a.facts.join(' ') || '' })).filter((x) => x.text)
    setTurns((p) => [...p, { id: ++seq.current, role: 'user', text }])
    setQ('')
    try {
      const r = await csrfFetch('/api/support/assistant', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, locale, history }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(d))
      setTurns((p) => [...p, { id: ++seq.current, role: 'assistant', q: text, a: d as Answer }])
    } catch (e) {
      setError((e as Error).message || t('account.saFailed'))
    } finally {
      setBusy(false)
    }
  }, [q, busy, turns, locale, apiError, t])

  const escalate = async (turn: Extract<Turn, { role: 'assistant' }>) => {
    setTurns((p) => p.map((x) => (x.id === turn.id ? { ...x, ticket: 'busy' } as Turn : x)))
    try {
      const r = await csrfFetch('/api/support/assistant/escalate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: turn.q, ...(turn.a.answer_id ? { answer_id: turn.a.answer_id } : {}) }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(apiError(d))
      setTurns((p) => p.map((x) => (x.id === turn.id ? { ...x, ticket: 'done' } as Turn : x)))
      addToast({ type: 'success', title: t('account.saEscalated') })
      onTicketCreated?.()
    } catch (e) {
      setTurns((p) => p.map((x) => (x.id === turn.id ? { ...x, ticket: undefined } as Turn : x)))
      addToast({ type: 'error', title: (e as Error).message || t('account.saFailed') })
    }
  }

  if (!status?.enabled) return null

  return (
    <Panel className="p-4 sm:p-6" aria-labelledby="support-assistant-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 id="support-assistant-title" className="text-base font-semibold text-foreground">{t('account.saTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('account.saDesc')}</p>
          </div>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setTurns([]); setError(null) }}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden />{t('account.saClear')}</Button>
        )}
      </div>

      {!status.ai && <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{t('account.saAiOff')}</p>}

      {turns.length > 0 && (
        <ol className="mb-4 max-h-[55dvh] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((x) => x.role === 'user' ? (
            <li key={x.id} className="ml-auto max-w-[90%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground sm:max-w-[75%]">
              <span className="sr-only">{t('account.saYou')}: </span>{x.text}
            </li>
          ) : (
            <li key={x.id} className="max-w-full rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-foreground sm:max-w-[85%]">
              <span className="sr-only">{t('account.saAssistant')}: </span>
              {x.a.answer ? <p className="whitespace-pre-wrap leading-relaxed">{x.a.answer}</p> : (
                <p className="text-muted-foreground">{x.a.results.length || x.a.facts.length ? t('account.saFallbackNote') : t('account.saNoAnswer')}</p>
              )}
              {x.a.facts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('account.saYourRecords')}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">{x.a.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
              {x.a.results.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('account.saSources')}</p>
                  <ul className="space-y-1">
                    {x.a.results.filter((r) => !x.a.answer || !x.a.cited.length || x.a.cited.includes(r.n)).slice(0, 5).map((r) => (
                      <li key={r.n}><Link href={r.url} className="text-primary underline-offset-2 hover:underline focus-visible:underline">[{r.n}] {r.title}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                {x.ticket === 'done' ? (
                  <p className="text-xs text-green-700 dark:text-green-400">{t('account.saEscalated')}</p>
                ) : (
                  <Button variant={x.a.escalate ? 'default' : 'outline'} size="sm" className="rounded-full" disabled={x.ticket === 'busy'} onClick={() => escalate(x)}>
                    {x.ticket === 'busy' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Ticket className="mr-1.5 h-4 w-4" aria-hidden />}
                    {t('account.saEscalate')}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {busy && <li className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t('account.saThinking')}</li>}
          <li ref={endRef} aria-hidden className="h-0 list-none" />
        </ol>
      )}

      {error && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void ask() }}>
        <div className="min-w-0 flex-1">
          <Label htmlFor="support-assistant-q" className="sr-only">{t('account.saQuestionLabel')}</Label>
          <Textarea
            id="support-assistant-q" rows={2} maxLength={600} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('account.saPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask() } }}
          />
        </div>
        <Button type="submit" disabled={busy || q.trim().length < 2} className="rounded-full sm:mb-0.5">
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="mr-1.5 h-4 w-4" aria-hidden />}{t('account.saAsk')}
        </Button>
      </form>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><LifeBuoy className="h-3.5 w-3.5" aria-hidden />{t('account.saPrivacy')}</p>
    </Panel>
  )
}
