'use client'

/** A study-plan practice set: approved bank questions at the planned difficulty, graded on the server. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { QuestionAnswerInput } from '@/components/assessment/QuestionAnswerInput'
import type { PlanItem } from '@/lib/study-plan/types'
import type { PracticeQuestion } from '@/lib/study-plan/service'

interface SetData { item: PlanItem; questions: PracticeQuestion[]; results: { question_id: string; correct: boolean }[] }
interface Graded { results: { question_id: string; correct: boolean; answer?: string; explanation?: string }[]; score: number; total: number }

export default function PracticePage() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const { id = '' } = useParams<{ id: string }>()
  const [data, setData] = useState<SetData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [graded, setGraded] = useState<Graded | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/study-plan/practice/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load'); setData(j) }).catch((e) => setErr(e.message))
  }, [id])
  useEffect(() => { if (gate.ready) load() }, [gate.ready, load])

  if (!gate.ready) return null
  if (err) return <EmptyState illustration="error" title="This practice set is not available" description={err} actionLabel="Back to your plan" actionHref="/dashboard/study-plan" />
  if (!data) return <div className="mx-auto h-48 max-w-3xl animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
  const res = new Map((graded?.results || []).map((r) => [r.question_id, r]))
  const answered = Object.values(answers).filter((v) => (Array.isArray(v) ? v.length : String(v).trim())).length
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={data.item.title} icon={<ListChecks />} description={data.item.reason} actions={<Button asChild variant="outline" className="rounded-full"><Link href="/dashboard/study-plan">Back to plan</Link></Button>} />
      {graded && (
        <Panel className="mb-5 p-4 text-foreground" role="status">
          You got <span className="font-semibold tabular-nums">{graded.score}</span> of <span className="tabular-nums">{graded.results.length}</span> answered questions right. Your plan uses this to pick next week's topics.
        </Panel>
      )}
      <ol className="space-y-4">
        {data.questions.map((q, i) => {
          const r = res.get(q.id)
          return (
            <li key={q.id}>
              <Panel className="space-y-3 p-5">
                <p className="whitespace-pre-line font-medium text-foreground"><span className="mr-1 tabular-nums text-muted-foreground">{i + 1}.</span>{q.prompt}</p>
                <QuestionAnswerInput question={q} value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} readOnly={!!graded} />
                {r && (
                  <div className={`rounded-xl p-3 text-sm ${r.correct ? 'bg-green-500/10 text-green-800 dark:text-green-300' : 'bg-red-500/10 text-red-800 dark:text-red-300'}`}>
                    <p className="flex items-center gap-1.5 font-medium">{r.correct ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}{r.correct ? 'Correct' : `Not quite${r.answer ? ` — answer: ${r.answer}` : ''}`}</p>
                    {r.explanation && <p className="mt-1 text-foreground">{r.explanation}</p>}
                  </div>
                )}
              </Panel>
            </li>
          )
        })}
      </ol>
      {!graded && (
        <div className="sticky bottom-4 mt-6 flex justify-end">
          <Button className="min-h-[44px] rounded-full shadow-lg" disabled={busy || answered === 0} onClick={async () => {
            setBusy(true)
            try {
              const r = await csrfFetch(`/api/study-plan/practice/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) })
              const j = await r.json()
              if (!r.ok) throw new Error(j.error || 'Could not check your answers')
              setGraded(j)
            } catch (e) { addToast({ type: 'error', title: (e as Error).message }) } finally { setBusy(false) }
          }}>{busy ? 'Checking…' : `Check ${answered} answer${answered === 1 ? '' : 's'}`}</Button>
        </div>
      )}
    </div>
  )
}
