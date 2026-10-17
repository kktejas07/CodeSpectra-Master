'use client'

/**
 * Candidate answer input for every assessment question type. Single renderer
 * shared by the candidate runner (`app/assessment/[id]`) and the dashboard
 * assessment runner/preview, so a new type only ever needs UI in one place.
 *
 * Value encoding (must match the graders in lib/grading.ts):
 *  - choice / multi / fill_blanks / numeric / short_answer / likert / rating /
 *    hotspot → string (multi = string[])
 *  - ordering / ranking / matrix / table_fill → comma-separated CSV string
 *  - matching / drag_drop → JSON string `{ left: right, ... }`
 *  - coding + variants → JSON string `{ language, code }`
 *
 * ponytail: click/dropdown/reorder-button interactions only (no HTML5
 * drag-and-drop yet) — see Phase 2 decision. Hotspot regions are percentages
 * (x/y = top-left, w/h = size, each 0-100).
 */

import { CodingQuestionEditor } from '@/components/assessment/CodingQuestionEditor'
import { normalizeCodeLang } from '@/lib/code-languages'
import { canonicalType, metaFor } from '@/lib/question-types'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface AnswerQuestion {
  id: string
  type: string
  prompt?: string
  options?: string[]
  pairs?: { left: string; right: string }[]
  matrix?: { rows: string[]; columns: string[] }
  table?: { columns: string[]; rows: string[] }
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string }
  image_url?: string
  regions?: { id: string; x: number; y: number; w: number; h: number; label?: string }[]
  language?: string
  starter_code?: string
}

export interface QuestionAnswerInputProps {
  question: AnswerQuestion
  value: string | string[] | undefined
  onChange: (value: string | string[]) => void
  /** Pre-shuffled display order for choice/sequence option lists. */
  shuffledOptions?: string[]
  readOnly?: boolean
  showSavedBadge?: boolean
}

function asCsv(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',').map((s) => s.trim())
  return []
}

function parsePairs(value: string | string[] | undefined): Record<string, string> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const p = JSON.parse(value)
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function SavedBadge({ show }: { show?: boolean }) {
  if (!show) return null
  return <span className="text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">Saved locally</span>
}

const inputCls = 'w-full px-4 py-3 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm'

export function QuestionAnswerInput({ question, value, onChange, shuffledOptions, readOnly, showSavedBadge }: QuestionAnswerInputProps) {
  const type = canonicalType(question.type)
  const meta = metaFor(type)
  const kind = meta.kind

  // ── Hotspot: click the correct image region ──
  if (type === 'hotspot') {
    const selected = typeof value === 'string' ? value : ''
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Click the correct region:</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="relative inline-block max-w-full rounded-lg border overflow-hidden bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={question.image_url || ''} alt="Hotspot" className="block max-w-full select-none" draggable={false} />
          {(question.regions || []).map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && onChange(r.id)}
              title={r.label || r.id}
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
              className={`absolute border-2 transition-colors ${selected === r.id ? 'border-primary bg-primary/30' : 'border-primary/40 bg-primary/5 hover:bg-primary/20'}`}
            />
          ))}
        </div>
        {selected && <p className="text-xs text-muted-foreground">Selected: {(question.regions || []).find((r) => r.id === selected)?.label || selected}</p>}
      </div>
    )
  }

  // ── Single / multi choice (mcq, true_false, yes_no, multiple_response) ──
  if (kind === 'choice' || kind === 'multi') {
    const isMulti = kind === 'multi'
    const fallback = type === 'true_false' ? ['True', 'False'] : type === 'yes_no' ? ['Yes', 'No'] : []
    const opts = shuffledOptions?.length ? shuffledOptions : (question.options?.length ? question.options : fallback)
    const selectedArr = Array.isArray(value) ? value : []
    return (
      <div className="space-y-3">
        {opts.map((opt, i) => {
          const checked = isMulti ? selectedArr.includes(opt) : value === opt
          return (
            <label
              key={i}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${readOnly ? '' : 'cursor-pointer'} ${checked ? 'bg-primary/10 border-primary shadow-xs' : 'bg-card border-border hover:border-primary/50'}`}
            >
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`q-${question.id}`}
                value={opt}
                checked={checked}
                disabled={readOnly}
                onChange={() => {
                  if (readOnly) return
                  if (isMulti) {
                    const next = selectedArr.includes(opt) ? selectedArr.filter((a) => a !== opt) : [...selectedArr, opt]
                    onChange(next)
                  } else {
                    onChange(opt)
                  }
                }}
                className="h-4 w-4 accent-primary text-primary focus:ring-primary border-input"
              />
              <span className="text-sm font-medium text-foreground">{opt}</span>
            </label>
          )
        })}
      </div>
    )
  }

  // ── Fill in the blanks ──
  if (kind === 'blanks') {
    const blankCount = ((question.prompt || '').match(/___/g) || []).length
    const current = typeof value === 'string' ? value : ''
    if (blankCount > 1) {
      const arr = asCsv(value)
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Fill in {blankCount} blank(s):</label>
            <SavedBadge show={showSavedBadge} />
          </div>
          {Array.from({ length: blankCount }, (_, idx) => (
            <div key={idx} className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Blank {idx + 1}</label>
              <input
                type="text"
                value={arr[idx] || ''}
                disabled={readOnly}
                onChange={(e) => {
                  const next = [...arr]
                  next[idx] = e.target.value
                  onChange(next.map((s) => (s || '').trim()).join(', '))
                }}
                placeholder={`Answer for blank ${idx + 1}…`}
                aria-label={`Blank ${idx + 1}`}
                className={inputCls}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Your answer</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <input type="text" aria-label="Your answer" value={current} disabled={readOnly} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" className={inputCls} autoComplete="off" />
      </div>
    )
  }

  // ── Numeric / short answer ──
  if (kind === 'numeric' || kind === 'text') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">{kind === 'numeric' ? 'Your numeric answer:' : 'Your answer:'}</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <input
          type="text"
          inputMode={kind === 'numeric' ? 'decimal' : 'text'}
          value={typeof value === 'string' ? value : ''}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          placeholder={kind === 'numeric' ? 'e.g. 42' : 'Type your answer…'}
          aria-label={kind === 'numeric' ? 'Your numeric answer' : 'Your answer'}
          className={inputCls}
          autoComplete="off"
        />
      </div>
    )
  }

  // ── Ordering / ranking: reorder with up/down buttons ──
  if (kind === 'sequence') {
    const pool = shuffledOptions?.length ? shuffledOptions : (question.options || [])
    const given = asCsv(value).filter(Boolean)
    // Derive a usable order: use the user's order, else fall back to the pool.
    const order = given.length === pool.length ? given : pool
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir
      if (j < 0 || j >= order.length) return
      const next = [...order]
      ;[next[i], next[j]] = [next[j], next[i]]
      onChange(next.join(', '))
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">{type === 'ranking' ? 'Rank these (top = highest):' : 'Put these in the correct order:'}</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="space-y-2">
          {order.map((item, i) => (
            <div key={`${item}-${i}`} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              <span className="text-xs font-medium tabular-nums text-muted-foreground w-6">{i + 1}.</span>
              <span className="flex-1 text-sm font-medium">{item}</span>
              <button type="button" disabled={readOnly || i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-lg border border-border disabled:opacity-30 hover:bg-muted" aria-label="Move up">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" disabled={readOnly || i === order.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded-lg border border-border disabled:opacity-30 hover:bg-muted" aria-label="Move down">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Matching / drag-drop (labeling): dropdown per left item ──
  if (kind === 'pairs') {
    const pairs = question.pairs || []
    const rights = Array.from(new Set(pairs.map((p) => p.right)))
    const map = parsePairs(value)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Match each item to its correct pair:</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="space-y-2">
          {pairs.map((p, i) => (
            <div key={`${p.left}-${i}`} className="flex items-center gap-3">
              <span className="flex-1 text-sm font-medium p-3 rounded-lg border bg-card">{p.left}</span>
              <span className="text-muted-foreground">→</span>
              <select
                value={map[p.left] || ''}
                disabled={readOnly}
                onChange={(e) => onChange(JSON.stringify({ ...map, [p.left]: e.target.value }))}
                aria-label={`Match for ${p.left}`}
                className="w-36 sm:w-48 px-3 py-2 rounded-lg border border-border bg-card text-sm"
              >
                <option value="">— select —</option>
                {rights.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Matrix: one column choice per row ──
  if (kind === 'matrix') {
    const rows = question.matrix?.rows || []
    const columns = question.matrix?.columns || []
    const arr = asCsv(value)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Select one option per row:</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="rounded-lg border overflow-hidden">
          <div className="grid bg-muted/40 text-xs font-semibold" style={{ gridTemplateColumns: `1fr repeat(${columns.length}, minmax(64px, auto))` }}>
            <div className="px-3 py-2" />
            {columns.map((c) => <div key={c} className="px-3 py-2 text-center">{c}</div>)}
          </div>
          {rows.map((row, ri) => (
            <div key={`${row}-${ri}`} className="grid border-t items-center" style={{ gridTemplateColumns: `1fr repeat(${columns.length}, minmax(64px, auto))` }}>
              <div className="px-3 py-2 text-sm">{row}</div>
              {columns.map((c) => (
                <div key={c} className="px-3 py-2 text-center">
                  <input
                    type="radio"
                    name={`matrix-${question.id}-${ri}`}
                    disabled={readOnly}
                    checked={arr[ri] === c}
                    aria-label={`${row}: ${c}`}
                    onChange={() => {
                      const next = [...arr]
                      next[ri] = c
                      onChange(next.map((s) => s || '').join(', '))
                    }}
                    className="h-4 w-4"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Table / grid fill: one text answer per row ──
  if (kind === 'table') {
    const rows = question.table?.rows || []
    const arr = asCsv(value)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Fill in each row:</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="space-y-2">
          {rows.map((row, ri) => (
            <div key={`${row}-${ri}`} className="flex items-center gap-3">
              <span className="flex-1 text-sm font-medium p-3 rounded-lg border bg-muted/30">{row}</span>
              <input
                type="text"
                value={arr[ri] || ''}
                disabled={readOnly}
                onChange={(e) => {
                  const next = [...arr]
                  next[ri] = e.target.value
                  onChange(next.map((s) => (s || '').trim()).join(', '))
                }}
                placeholder="Answer…"
                aria-label={`Answer for ${row}`}
                className="w-36 sm:w-56 px-3 py-2 rounded-lg border border-border bg-card text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Likert / rating (unscored) ──
  if (kind === 'unscored') {
    const min = question.scale?.min ?? 1
    const max = question.scale?.max ?? 5
    const values: number[] = []
    for (let v = min; v <= max; v++) values.push(v)
    const current = typeof value === 'string' ? value : ''
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">{type === 'rating' ? 'Rate:' : 'Select a level:'}</label>
          <SavedBadge show={showSavedBadge} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {question.scale?.minLabel && <span className="text-xs text-muted-foreground">{question.scale.minLabel}</span>}
          {values.map((v) => (
            <button
              key={v}
              type="button"
              disabled={readOnly}
              onClick={() => onChange(String(v))}
              className={`h-10 w-10 rounded-full border text-sm font-medium transition-colors ${current === String(v) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:border-primary/50'}`}
            >
              {v}
            </button>
          ))}
          {question.scale?.maxLabel && <span className="text-xs text-muted-foreground">{question.scale.maxLabel}</span>}
        </div>
      </div>
    )
  }

  // ── Coding + variants (shared code editor) ──
  if (meta.group === 'coding') {
    // A question authored for a specific language (it ships starter_code, e.g.
    // debug/completion/review tasks) is locked to that language — switching
    // would leave the candidate a snippet in the wrong language.
    const locked = !!question.language
    let code = ''
    let lang = normalizeCodeLang(question.language || 'python')
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        code = parsed?.code || ''
        if (!locked) lang = normalizeCodeLang(parsed?.language || lang)
      } catch {
        code = value
      }
    }
    const writeAnswer = (nextLang: string, nextCode: string) => onChange(JSON.stringify({ language: nextLang, code: nextCode }))
    if (readOnly) {
      return (
        <pre className="w-full min-h-32 p-4 text-sm bg-card text-foreground rounded-lg border border-border overflow-auto font-mono">{code || '— no answer —'}</pre>
      )
    }
    return (
      <CodingQuestionEditor
        question={{ ...question, starter_code: question.starter_code } as never}
        answer={code}
        language={lang}
        lockLanguage={locked}
        onChange={(nextCode) => writeAnswer(lang, nextCode ?? '')}
        onLanguageChange={(nextLang) => writeAnswer(nextLang, code)}
      />
    )
  }

  // ── Descriptive / written (fallback) ──
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">Your answer</label>
        <SavedBadge show={showSavedBadge} />
      </div>
      <textarea
        value={typeof value === 'string' ? value : ''}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write your response here…"
        aria-label="Your answer"
        className="w-full h-96 p-4 text-sm bg-card text-foreground rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        spellCheck={false}
      />
    </div>
  )
}

export default QuestionAnswerInput
