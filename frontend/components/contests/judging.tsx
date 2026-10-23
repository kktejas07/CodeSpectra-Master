'use client'

/**
 * Judging for ideathons and system design jams: the latest submission per
 * entry, files to download, and a score per rubric criterion. Used on the
 * admin contest page and on /contests/<slug>/judge for assigned judges.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gavel, Loader2 } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import type { ContestRubricCriterion } from '@/lib/contests/types'
import { jsonApi } from './shared'
import { useT } from '@/lib/i18n/client'

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

interface JudgeItem { id: string; entry_name: string; status: string; score: number | null; text: string; files: { id: string; name: string; role: string }[]; judges: number; my_score: { scores: { name: string; score: number }[]; comment: string } | null }

export function JudgingTab({ base, released }: { base: string; released: boolean }) {
  const addToast = useToast()
  const { t } = useT()
  const [items, setItems] = useState<JudgeItem[] | null>(null)
  const [rubric, setRubric] = useState<ContestRubricCriterion[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { const d = await jsonApi<{ items: JudgeItem[]; rubric: ContestRubricCriterion[] }>(`${base}/judging`); setItems(d.items); setRubric(d.rubric); setError(null) } catch (e) { setError((e as Error).message) }
  }, [base])
  useEffect(() => { void load() }, [load])
  if (error) return <Panel className="text-sm text-destructive">{error}</Panel>
  if (!items) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label={t('compete.ctLoadingSubs')} /></div>
  if (!items.length) return <EmptyState compact illustration="inbox" title={t('compete.ctNoSubs')} description={t('compete.ctNoSubsBody')} />
  return (
    <div className="space-y-4">
      {items.map((it) => <JudgeCard key={it.id} item={it} rubric={rubric} base={base} released={released} onSaved={async () => { addToast({ type: 'success', title: t('compete.ctScoreSaved') }); await load() }} />)}
    </div>
  )
}

function JudgeCard({ item, rubric, base, released, onSaved }: { item: JudgeItem; rubric: ContestRubricCriterion[]; base: string; released: boolean; onSaved: () => Promise<void> }) {
  const addToast = useToast()
  const { t } = useT()
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries((item.my_score?.scores || []).map((s) => [s.name, s.score])))
  const [comment, setComment] = useState(item.my_score?.comment || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await jsonApi(`${base}/judging`, json('POST', { submission_id: item.id, scores: rubric.map((r) => ({ name: r.name, score: Number(scores[r.name] ?? 0) })), comment }))
      await onSaved()
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{item.entry_name}</h3>
        <span className="text-sm text-muted-foreground">{t('compete.ctJudges', { count: item.judges })} · {t('compete.ctScoreLower')} <span className="font-mono tabular-nums text-foreground">{item.score ?? '–'}</span></span>
      </div>
      <p className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-foreground">{item.text}</p>
      {item.files.length > 0 && <p className="flex flex-wrap gap-3 text-sm">{item.files.map((f) => <a key={f.id} href={`${base}/files/${f.id}`} className="text-primary underline-offset-4 hover:underline">{f.name}</a>)}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rubric.map((r) => (
          <div key={r.name} className="space-y-1">
            <Label htmlFor={`${item.id}-${r.name}`}>{r.name} (0–{r.weight})</Label>
            <Input id={`${item.id}-${r.name}`} type="number" min={0} max={r.weight} step="0.5" value={scores[r.name] ?? ''} disabled={released} onChange={(e) => setScores({ ...scores, [r.name]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      <div className="space-y-1"><Label htmlFor={`${item.id}-c`}>{t('compete.ctCommentOptional')}</Label><Textarea id={`${item.id}-c`} rows={2} value={comment} disabled={released} onChange={(e) => setComment(e.target.value)} /></div>
      <Button variant="outline" disabled={busy || released} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Gavel className="h-4 w-4" />} {t('compete.ctSaveScore')}</Button>
    </Panel>
  )
}

