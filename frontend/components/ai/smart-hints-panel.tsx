'use client'

import { useState } from 'react'
import { Lightbulb, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

interface HintsPanelProps {
  problemSlug: string
  language: string
  currentCode: string
}

interface HintEntry {
  level: number
  hint: string
}

const LEVELS = (t: Translator) => ([
  { level: 1, label: t('dash.nudge'), desc: t('dash.tinyHint') },
  { level: 2, label: t('dash.approach'), desc: t('dash.highLevelPlan') },
  { level: 3, label: t('dash.pseudoCode'), desc: t('dash.skeletonOutline') },
  { level: 4, label: t('dash.solution'), desc: t('dash.fullCode') },
] as const)

/**
 * Progressive Smart Hints — calls /api/ai/hints. Each new level unlocks more.
 */
export function SmartHintsPanel({ problemSlug, language, currentCode }: HintsPanelProps) {
  const { t } = useT()
  const [hints, setHints] = useState<HintEntry[]>([])
  const [loading, setLoading] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function reveal(level: number) {
    setErr(null)
    setLoading(level)
    try {
      const res = await csrfFetch('/api/ai/hints', {
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
      if (!res.ok) throw new Error(j.error || (res.status === 429 ? t('dash.tooManyRequestsWaitAMoment928') : t('dash.somethingWentWrongStatusPleaseTryb1e', { status: res.status })))
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
    <div className="rounded-2xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="hints-toggle"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-2 text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-700 dark:text-amber-400" />{t('dash.smartHints')}{hints.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] tabular-nums text-amber-700 dark:text-amber-400">
              {hints.length}/4 unlocked
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? t('dash.hide') : t('dash.show')}
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs text-muted-foreground">{t('dash.progressiveHintsEachLevelRevealsMore7c3')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LEVELS(t).map((l) => {
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
                  <span className="text-[11px]">{l.label}</span>
                </Button>
              )
            })}
          </div>

          {err && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
              {err}
            </div>
          )}

          <div className="space-y-2">
            {hints
              .sort((a, b) => a.level - b.level)
              .map((h) => (
                <div
                  key={h.level}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
                  data-testid={`hint-content-${h.level}`}
                >
                  <div className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">{t('dash.levelLevelLabel', { level: h.level, label: LEVELS(t)[h.level - 1].label })}</div>
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
