'use client'

/**
 * Test sections editor (assessment edit page): create, rename, reorder
 * (buttons or drag), set instructions / time limit / lock-after-leaving, and
 * assign questions (drag a question onto a section, or pick its section).
 * Saves `sections` through PATCH /api/exams; rules in lib/exam-sections.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Layers, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { MAX_SECTIONS, MAX_SECTION_MINUTES, normalizeSections, type ExamSection } from '@/lib/exam-sections'
import { isScoredType, metaFor } from '@/lib/question-types'

interface QuestionLite { id: string; title: string; type: string; score?: number }

const UNASSIGNED = '__none__'

function newSectionId(): string {
  return `sec_${Math.random().toString(36).slice(2, 10)}`
}

export function SectionsEditor({
  examId,
  questions,
  initial,
  durationMinutes,
  onSaved,
}: {
  examId: string
  questions: QuestionLite[]
  initial: unknown
  durationMinutes: number
  onSaved?: (sections: ExamSection[]) => void
}) {
  const addToast = useToast()
  const [sections, setSections] = useState<ExamSection[]>(() => normalizeSections(initial))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragSection, setDragSection] = useState<number | null>(null)
  const [dragQuestion, setDragQuestion] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  useEffect(() => { if (!dirty) setSections(normalizeSections(initial)) }, [initial, dirty])

  const qIds = useMemo(() => new Set(questions.map((q) => q.id)), [questions])
  const sectionOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sections) for (const q of s.question_ids) if (qIds.has(q) && !m.has(q)) m.set(q, s.id)
    return m
  }, [sections, qIds])
  const unassigned = questions.filter((q) => !sectionOf.has(q.id))

  const update = (next: ExamSection[]) => { setSections(next); setDirty(true) }
  const patch = (i: number, p: Partial<ExamSection>) => update(sections.map((s, j) => (j === i ? { ...s, ...p } : s)))

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return
    update([...sections, { id: newSectionId(), title: `Section ${sections.length + 1}`, time_limit_minutes: null, lock_after_leave: false, question_ids: [] }])
  }
  const removeSection = (i: number) => update(sections.filter((_, j) => j !== i))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return
    const next = [...sections]
    const [s] = next.splice(from, 1)
    next.splice(to, 0, s)
    update(next)
  }
  const assign = (qid: string, sectionId: string) => {
    update(sections.map((s) => {
      const without = s.question_ids.filter((x) => x !== qid)
      return s.id === sectionId ? { ...s, question_ids: [...without, qid] } : { ...s, question_ids: without }
    }))
  }

  const totals = (s: ExamSection) => {
    const qs = s.question_ids.map((id) => questions.find((q) => q.id === id)).filter((q): q is QuestionLite => !!q)
    return { count: qs.length, points: qs.reduce((a, q) => a + (isScoredType(q.type) ? Number(q.score) || 0 : 0), 0) }
  }
  const timedMinutes = sections.reduce((a, s) => a + (s.time_limit_minutes || 0), 0)

  const save = async () => {
    setSaving(true)
    try {
      const clean = normalizeSections(sections, questions.map((q) => q.id))
      const res = await csrfFetch('/api/exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: examId, sections: clean }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '')
      setSections(clean)
      setDirty(false)
      onSaved?.(clean)
      addToast({ type: 'success', title: clean.length ? 'Sections saved' : 'Sections removed' })
    } catch (e) {
      addToast({ type: 'error', title: 'Couldn’t save sections', message: e instanceof Error && e.message ? e.message : 'Your change was not saved.' })
    } finally {
      setSaving(false)
    }
  }

  const questionChip = (q: QuestionLite) => (
    <li
      key={q.id}
      draggable
      onDragStart={(e) => { setDragQuestion(q.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setDragQuestion(null); setDropTarget(null) }}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={q.title}>{q.title}</span>
      <Badge variant="outline" className="shrink-0 text-[11px]">{metaFor(q.type).short}</Badge>
      <label className="sr-only" htmlFor={`sec-of-${q.id}`}>Section for {q.title}</label>
      <select
        id={`sec-of-${q.id}`}
        value={sectionOf.get(q.id) ?? UNASSIGNED}
        onChange={(e) => {
          const v = e.target.value
          if (v === UNASSIGNED) update(sections.map((s) => ({ ...s, question_ids: s.question_ids.filter((x) => x !== q.id) })))
          else assign(q.id, v)
        }}
        className="h-8 max-w-[9rem] shrink-0 rounded-md border border-input bg-card px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value={UNASSIGNED}>No section</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
    </li>
  )

  const dropZone = (id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragQuestion) { e.preventDefault(); setDropTarget(id) } },
    onDragLeave: () => setDropTarget((t) => (t === id ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragQuestion) {
        if (id === UNASSIGNED) update(sections.map((s) => ({ ...s, question_ids: s.question_ids.filter((x) => x !== dragQuestion) })))
        else assign(dragQuestion, id)
      }
      setDragQuestion(null)
      setDropTarget(null)
    },
  })

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers className="h-5 w-5 text-primary" aria-hidden /> Sections</h2>
          <p className="text-sm text-muted-foreground">
            Split the test into ordered parts, each with its own timer if you like. Leave this empty for a single, untimed-by-section test.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addSection} disabled={sections.length >= MAX_SECTIONS}>
            <Plus className="h-4 w-4" aria-hidden /> Add section
          </Button>
          <Button size="sm" className="gap-1.5" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Save sections
          </Button>
        </div>
      </div>

      {sections.length > 0 && timedMinutes > durationMinutes && durationMinutes > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          Section time limits add up to <span className="tabular-nums">{timedMinutes}</span> minutes, more than the test’s <span className="tabular-nums">{durationMinutes}</span>. The overall time still ends the test.
        </p>
      )}

      {sections.length > 0 && (
        <ol className="space-y-3">
          {sections.map((s, i) => {
            const t = totals(s)
            const items = s.question_ids.map((id) => questions.find((q) => q.id === id)).filter((q): q is QuestionLite => !!q)
            return (
              <li
                key={s.id}
                draggable={!dragQuestion}
                onDragStart={(e) => { if (!dragQuestion) { setDragSection(i); e.dataTransfer.effectAllowed = 'move' } }}
                onDragOver={(e) => { if (dragSection !== null) e.preventDefault() }}
                onDrop={(e) => { if (dragSection !== null) { e.preventDefault(); move(dragSection, i); setDragSection(null) } }}
                onDragEnd={() => setDragSection(null)}
                className={`rounded-2xl border bg-card p-4 ${dropTarget === s.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                {...(dragQuestion ? dropZone(s.id) : {})}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <GripVertical className="mt-2 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label htmlFor={`sec-title-${s.id}`} className="text-xs">Section {i + 1} title</Label>
                    <Input id={`sec-title-${s.id}`} value={s.title} maxLength={120} onChange={(e) => patch(i, { title: e.target.value })} />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label htmlFor={`sec-time-${s.id}`} className="text-xs">Time limit (minutes)</Label>
                    <Input
                      id={`sec-time-${s.id}`}
                      type="number"
                      min={1}
                      max={MAX_SECTION_MINUTES}
                      placeholder="Shares test time"
                      value={s.time_limit_minutes ?? ''}
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value))
                        patch(i, { time_limit_minutes: e.target.value === '' || !Number.isFinite(n) || n < 1 ? null : Math.min(MAX_SECTION_MINUTES, n) })
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch id={`sec-lock-${s.id}`} checked={s.lock_after_leave} onCheckedChange={(v) => patch(i, { lock_after_leave: v === true })} />
                    <Label htmlFor={`sec-lock-${s.id}`} className="text-sm">Lock after leaving</Label>
                  </div>
                  <div className="ml-auto flex gap-1 pt-5">
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={`Move ${s.title} up`} onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={`Move ${s.title} down`} onClick={() => move(i, i + 1)} disabled={i === sections.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive" aria-label={`Remove ${s.title}`} onClick={() => removeSection(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Label htmlFor={`sec-ins-${s.id}`} className="text-xs">Instructions (optional)</Label>
                  <Textarea id={`sec-ins-${s.id}`} rows={2} maxLength={4000} value={s.instructions ?? ''} onChange={(e) => patch(i, { instructions: e.target.value })} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t.count}</span> questions · <span className="tabular-nums">{t.points}</span> points · {s.time_limit_minutes ? <><span className="tabular-nums">{s.time_limit_minutes}</span> min</> : 'shares the test time'}
                  {s.lock_after_leave ? ' · locks when the candidate leaves' : ''}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {items.map(questionChip)}
                  {items.length === 0 && <li className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Drag questions here, or pick this section next to a question.</li>}
                </ul>
              </li>
            )
          })}
        </ol>
      )}

      {sections.length > 0 && (
        <div className={`rounded-2xl border border-dashed p-4 ${dropTarget === UNASSIGNED ? 'border-primary' : 'border-border'}`} {...dropZone(UNASSIGNED)}>
          <p className="text-sm font-medium">Not in a section <span className="tabular-nums text-muted-foreground">({unassigned.length})</span></p>
          <p className="mb-2 text-xs text-muted-foreground">Candidates get these at the end of the last section.</p>
          <ul className="space-y-1.5">{unassigned.map(questionChip)}</ul>
        </div>
      )}
    </Panel>
  )
}
