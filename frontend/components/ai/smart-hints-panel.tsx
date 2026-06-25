'use client'

import { useState } from 'react'
import { Lightbulb, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HintsPanelProps {
  problemSlug: string
  language: string
  currentCode: string
}

interface HintEntry {
  level: number
  hint: string
}

const LEVELS = [
  { level: 1, label: 'Nudge', desc: 'Tiny hint' },
  { level: 2, label: 'Approach', desc: 'High-level plan' },
  { level: 3, label: 'Pseudo-code', desc: 'Skeleton outline' },
  { level: 4, label: 'Solution', desc: 'Full code' },
] as const

/**
 * Progressive Smart Hints — calls /api/ai/hints. Each new level unlocks more.
 */
export function SmartHintsPanel({ problemSlug, language, currentCode }: HintsPanelProps) {
  const [hints, setHints] = useState<HintEntry[]>([])
  const [loading, setLoading] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function reveal(level: number) {
    setErr(null)
    setLoading(level)
    try {
      const res = await fetch('/api/ai/hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_slug: problemSlug,
          hint_level: level,
          language,
          current_code: currentCode,
        }),
      })
      const j = (await res.json()) as { hint?: string; error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setHints((all) => [
        ...all.filter((h) => h.level !== level),
        { level, hint: j.hint || '' },
      ])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  const maxRevealed = hints.length === 0 ? 0 : Math.max(...hints.map((h) => h.level))

  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="hints-toggle"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span className="flex items-center gap-2 text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Smart Hints
          {hints.length > 0 && (
            <span className="rounded-full bg-amber-400/10 text-amber-400 px-2 py-0.5 text-[10px]">
              {hints.length}/4 unlocked
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Progressive hints — each level reveals more. Try the previous level first.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LEVELS.map((l) => {
              const unlocked = l.level <= maxRevealed + 1
              const got = hints.find((h) => h.level === l.level)
              return (
                <Button
                  key={l.level}
                  variant={got ? 'default' : 'outline'}
                  size="sm"
                  disabled={!unlocked || loading !== null}
                  onClick={() => reveal(l.level)}
                  data-testid={`hint-level-${l.level}`}
                  className={cn('flex-col h-auto py-2', !unlocked && 'opacity-60')}
                >
                  {loading === l.level ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : !unlocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <span className="text-xs font-semibold">L{l.level}</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide">{l.label}</span>
                </Button>
              )
            })}
          </div>

          {err && (
            <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive p-2 text-xs">
              {err}
            </div>
          )}

          <div className="space-y-2">
            {hints
              .sort((a, b) => a.level - b.level)
              .map((h) => (
                <div
                  key={h.level}
                  className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3"
                  data-testid={`hint-content-${h.level}`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-amber-400/80 mb-1">
                    Level {h.level} · {LEVELS[h.level - 1].label}
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/90">
                    {h.hint}
                  </pre>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
