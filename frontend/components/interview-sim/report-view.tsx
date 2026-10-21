'use client'

/**
 * Mock-interview feedback report (no hooks — used by the learner's session
 * page and the public shared-report page). `showAnswers` adds the learner's
 * own answers; the shared page never passes them.
 */
import Link from 'next/link'
import { BookOpen, CheckCircle2, Gauge, Lightbulb, Mic, Target } from 'lucide-react'
import { Panel, StatCard } from '@/components/app/page-kit'
import { Badge } from '@/components/ui/badge'
import { DIMENSIONS, DIMENSION_LABEL, READINESS_LABEL, type Readiness, type SimReport } from '@/lib/interview-sim/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

const READINESS_TONE: Record<Readiness, string> = {
  ready: 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300',
  almost: 'border-primary/30 bg-primary/10 text-primary',
  developing: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  not_yet: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300',
}

function Bar({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ReportView({ report, answers }: { report: SimReport; answers?: Record<string, string[]> }) {
  const { td, t } = useT()
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('exam.overall')} value={<span className="font-mono">{report.overall}<span className="text-base text-muted-foreground">/100</span></span>} icon={<Gauge aria-hidden />} hint={t('exam.answeredOfPlannedQuestionsAnswered', { answered: report.answered, planned: report.planned })} />
        <Panel className="flex flex-col justify-center gap-2 p-5">
          <p className="text-sm font-medium text-muted-foreground">{t('exam.readiness')}</p>
          <span className={cn('inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-semibold', READINESS_TONE[report.readiness])}>{td(`exam.readinessLabel:${report.readiness}`, READINESS_LABEL[report.readiness])}</span>
          {report.fallback && <p className="text-xs text-muted-foreground">{t('exam.summaryBuiltFromYourScoresThe3e1')}</p>}
        </Panel>
        {report.voice ? (
          <StatCard
            label={t('exam.speaking')}
            icon={<Mic aria-hidden />}
            value={report.voice.wpm !== null ? <span className="font-mono">{report.voice.wpm} <span className="text-base text-muted-foreground">{t('exam.wpm2')}</span></span> : '—'}
            hint={t('exam.countFillerWordsFillerPer100c00', { count: report.voice.filler_count, filler_per_100: report.voice.filler_per_100, value: report.voice.pace ? ` · pace ${report.voice.pace}` : '' })}
          />
        ) : (
          <StatCard label={t('exam.questions')} value={report.answered} icon={<Target aria-hidden />} hint={t('exam.scoredAgainstTheRoundRubric')} />
        )}
      </div>

      <Panel className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t('exam.summary')}</h2>
        <p className="text-[15px] leading-relaxed text-foreground">{report.summary}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {DIMENSIONS.map((d) => <Bar key={d} label={td(`exam.dimensionLabel:${d}`, DIMENSION_LABEL[d])} value={report.dimension_averages[d]} />)}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" aria-hidden />{t('exam.strengths')}</h2>
          {report.strengths.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">{t('exam.answerMoreQuestionsToSeeYourd0d')}</p>}
          {report.tips.length > 0 && (
            <>
              <h3 className="flex items-center gap-2 pt-2 text-sm font-semibold text-foreground"><Lightbulb className="h-4 w-4 text-primary" aria-hidden />{t('exam.tipsForNextTime')}</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">{report.tips.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {report.voice?.top_fillers.length ? (
            <p className="pt-2 text-sm text-muted-foreground">{t('exam.mostUsedFillers')}{' '}{report.voice.top_fillers.map((f) => `“${f.word}” ×${f.count}`).join(', ')}</p>
          ) : null}
        </Panel>
        <Panel className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><BookOpen className="h-5 w-5 text-primary" aria-hidden />{t('exam.whatToWorkOn')}</h2>
          {report.gaps.length ? (
            <ul className="space-y-4">
              {report.gaps.map((g, i) => (
                <li key={i} className="space-y-1.5">
                  <p className="font-medium text-foreground">{g.topic}</p>
                  {g.note && <p className="text-sm text-muted-foreground">{g.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {g.links.map((l, j) => (
                      <Link key={j} href={l.href} className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors duration-150 hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t('exam.noClearGapsKeepPractisingHarder537')}</p>}
        </Panel>
      </div>

      <Panel className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t('exam.questionByQuestion')}</h2>
        {report.questions.length === 0 && <p className="text-sm text-muted-foreground">{t('exam.noQuestionsWereScored')}</p>}
        <ol className="space-y-3">
          {report.questions.map((q, i) => (
            <li key={q.question_id}>
              <details className="group rounded-2xl border border-border/70 bg-muted/20 p-4 open:bg-card">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="text-xs text-muted-foreground">{t('exam.question')}{' '}{i + 1} · {q.topic}</span>
                    <span className="mt-0.5 block text-sm font-medium text-foreground">{q.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {q.flagged && <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-300">{t('exam.checked')}</Badge>}
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{q.score}</span>
                  </span>
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {DIMENSIONS.map((d) => <span key={d} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{td(`exam.dimensionLabel:${d}`, DIMENSION_LABEL[d])} <span className="font-mono tabular-nums">{q.scores[d]}/5</span></span>)}
                  </div>
                  {q.feedback && <p className="text-foreground">{q.feedback}</p>}
                  {answers?.[q.question_id]?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">{t('exam.yourAnswer')}</p>
                      {answers[q.question_id].map((a, k) => <p key={k} className="mt-1 whitespace-pre-wrap text-foreground">{a}</p>)}
                    </div>
                  ) : null}
                  {q.model_answer && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary">{t('exam.aStrongAnswer')}</p>
                      <p className="mt-1 text-foreground">{q.model_answer}</p>
                    </div>
                  )}
                  {q.gaps.length > 0 && <p className="text-muted-foreground">{t('exam.toStudyValue', { value: q.gaps.join(', ') })}</p>}
                </div>
              </details>
            </li>
          ))}
        </ol>
        {report.questions.some((q) => q.flagged) && (
          <p className="text-xs text-muted-foreground">{t('exam.checkedAnswersContainedTextAimedAt001')}</p>
        )}
      </Panel>
    </div>
  )
}
