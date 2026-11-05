'use client'

/**
 * Shared picker + generate form for industry / tech-stack / level practice
 * problem sets. One component, two hosts:
 *   - the learner page (credit-gated, POST /api/practice/domain)
 *   - the admin question generator (bulk, POST /api/admin/practice/domain)
 * The host decides the endpoint + result rendering; the form owns selection,
 * validation, and the industry→subject→level coordinate.
 */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INDUSTRIES, subjectsForIndustry, COURSE_LEVELS, type IndustryId } from '@/lib/courses/catalog'
import { buildDomainPracticeSpec } from '@/lib/practice-content/domain-spec'

export interface DomainPracticeSelection {
  industry: IndustryId
  techStack: string
  level: string
}

export function DomainPracticeForm({
  defaultIndustry = 'software',
  defaultCount,
  disabled,
  onGenerate,
  generateLabel,
  children,
}: {
  defaultIndustry?: IndustryId
  defaultCount?: number
  disabled?: boolean
  onGenerate: (sel: DomainPracticeSelection, count: number) => void
  /** Host's generate button label; the form renders it so both hosts share one style. */
  generateLabel: string
  /** Host-specific extras under the count control (e.g. an "Admin →" link). */
  children?: React.ReactNode
}) {
  const [industry, setIndustry] = useState<IndustryId>(defaultIndustry)
  const [techStack, setTechStack] = useState('')
  const [customTech, setCustomTech] = useState('')
  const [level, setLevel] = useState('')
  const [count, setCount] = useState(defaultCount ?? 3)

  const subjectNames = useMemo(() => subjectsForIndustry(industry).map(s => s.name), [industry])
  const selectedTech = customTech.trim() || techStack
  const spec = selectedTech && level ? buildDomainPracticeSpec(industry, selectedTech, level as (typeof COURSE_LEVELS)[number]) : null

  const switchIndustry = (id: IndustryId) => {
    setIndustry(id)
    setTechStack('')
    setCustomTech('')
  }

  const canGenerate = Boolean(selectedTech && level) && !disabled

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Industry</Label>
        <select
          aria-label="Industry"
          value={industry}
          onChange={e => switchIndustry(e.target.value as IndustryId)}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {INDUSTRIES.map(ind => <option key={ind.id} value={ind.id}>{ind.label}</option>)}
        </select>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Tech stack / subject</Label>
        <div className="flex flex-wrap gap-2">
          {subjectNames.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => { setTechStack(name); setCustomTech('') }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${techStack === name && !customTech ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
            >
              {name}
            </button>
          ))}
        </div>
        <Input
          aria-label="Custom subject"
          className="mt-2 h-10"
          placeholder="Or type a custom subject…"
          value={customTech}
          onChange={e => setCustomTech(e.target.value)}
        />
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Level</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COURSE_LEVELS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${level === l ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">How many problems</Label>
        <select
          aria-label="Problem count"
          value={count}
          onChange={e => setCount(Number(e.target.value))}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {[1, 2, 3, 5, 8].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {spec && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          {spec.title} · difficulty <strong className="text-foreground">{spec.difficulty}</strong> · topics: {spec.topics.join(', ')}
        </div>
      )}

      <Button onClick={() => onGenerate({ industry, techStack: selectedTech, level }, count)} disabled={!canGenerate} className="w-full">
        {generateLabel}
      </Button>
      {children}
    </div>
  )
}
