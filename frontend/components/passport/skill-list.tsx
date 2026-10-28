/**
 * Read-only list of verified skills with their evidence (server-safe: used by
 * /p/[handle], /verify/[credentialId] and the dashboard preview).
 */
import { formatDate } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/config'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { EVIDENCE_KIND_LABELS, LEVEL_LABELS, PASSPORT_LEVELS, type PublicSkill } from '@/lib/passport/core'
import { cn } from '@/lib/utils'

const LEVEL_TONE = [
  'bg-muted text-muted-foreground',
  'bg-primary/10 text-primary',
  'bg-primary/20 text-primary',
  'bg-primary text-primary-foreground',
]

export function LevelPill({ level, className }: { level: PublicSkill['level']; className?: string }) {
  const i = PASSPORT_LEVELS.indexOf(level)
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', LEVEL_TONE[Math.max(0, i)], className)}>
      {LEVEL_LABELS[level]}
    </span>
  )
}

function LevelMeter({ level }: { level: PublicSkill['level'] }) {
  const i = PASSPORT_LEVELS.indexOf(level)
  return (
    <span className="flex gap-1" aria-hidden>
      {PASSPORT_LEVELS.map((l, n) => (
        <span key={l} className={cn('h-1.5 w-6 rounded-full', n <= i ? 'bg-primary' : 'bg-muted')} />
      ))}
    </span>
  )
}

const fmt = (iso: string, locale: Locale) => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? formatDate(locale, d, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''
}

export function SkillList({ skills, showEvidence = true, locale = 'en' }: { skills: PublicSkill[]; showEvidence?: boolean; locale?: Locale }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {skills.map((s) => (
        <li key={s.skill} className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold capitalize text-foreground">{s.skill}</h3>
            <LevelPill level={s.level} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <LevelMeter level={s.level} />
            <span className="tabular-nums">Score {s.score}</span>
            <span>
              {s.evidenceCount} result{s.evidenceCount === 1 ? '' : 's'}
              {s.proctoredCount > 0 ? `, ${s.proctoredCount} proctored` : ''}
            </span>
          </div>
          {showEvidence && s.evidence.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-sm">
              {s.evidence.slice(0, 4).map((e, i) => (
                <li key={`${e.title}-${i}`} className="flex items-start gap-2">
                  {e.proctored ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Proctored" /> : <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    {e.link ? (
                      <a href={e.link} className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" rel="noopener">{e.title}</a>
                    ) : (
                      <span className="font-medium text-foreground">{e.title}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {EVIDENCE_KIND_LABELS[e.kind]} · <span className="tabular-nums">{e.score}</span> · {fmt(e.at, locale)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
