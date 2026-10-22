'use client'

/**
 * Learner home as a bento overview. Each card loads its own data from the
 * existing APIs (study plan, contests, interview sim, passport, company tests)
 * so one slow or failing source never blanks the rest: every card has a
 * skeleton, an empty state that says what to do next, and an error line.
 */
import { useEffect, useState } from 'react'
import { BadgeCheck, Building2, CalendarCheck, Code, Flame, Mic, Trophy } from 'lucide-react'
import {
  BentoAction, BentoBody, BentoCard, BentoEmpty, BentoGrid, BentoIcon, BentoList, BentoPill, BentoStat, BentoText, BentoTitle,
  Meter, Sparkline, SkeletonBar, spanClass,
} from '@/components/bento'
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { DailyChallengeWidget } from '@/components/dashboard/daily-challenge-widget'
import { useT } from '@/lib/i18n/client'
import { useLocaleDates } from '@/lib/i18n/use-dates'
import type { Translator } from '@/lib/i18n/catalog'

type Load<T> = { data: T | null; loading: boolean; error: boolean }

function useJson<T>(url: string, pick: (j: unknown) => T): Load<T> {
  const [s, setS] = useState<Load<T>>({ data: null, loading: true, error: false })
  useEffect(() => {
    let live = true
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setS({ data: pick(j), loading: false, error: false }) })
      .catch(() => { if (live) setS({ data: null, loading: false, error: true }) })
    return () => { live = false }
    // `pick` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return s
}

/* ── API shapes (only the fields we read) ─────────────────────────────── */
interface PlanItem { id: string; title: string; minutes: number; href: string; done_at?: string | null; kind: string }
interface PlanView {
  plan: { target: { kind: string; pattern_id?: string | null; label: string } }
  today_items: PlanItem[]
  progress: { done: number; total: number }
  streak: { current: number; longest: number; activeToday: boolean }
}
interface Contest { slug: string; title: string; format: string; phase: string; schedule: { starts_at: string; ends_at: string } }
interface SimItem { status: string; overall: number | null; readiness: 'ready' | 'almost' | 'developing' | 'not_yet' | null; created_at: string }
interface PassportSkill { skill: string; level: 'beginner' | 'intermediate' | 'advanced' | 'expert'; score: number }
interface Attempt { id: string; patternId: string; examName: string; companyName: string; level: 'easy' | 'moderate' | 'tough'; status: 'in_progress' | 'completed'; createdAt: string; result?: { percent?: number; passed?: boolean } }
interface Pattern { id: string; examName: string; companyName: string; verified: boolean; sections: Array<{ timeMinutes: number }>; levels: Array<{ level: string; ready: boolean }> }

const pickPlan = (j: unknown) => ((j as { view?: PlanView | null })?.view ?? null)
const pickContests = (j: unknown) => (((j as { items?: Contest[] })?.items) ?? [])
const pickSims = (j: unknown) => (((j as { sessions?: SimItem[] })?.sessions) ?? [])
const pickPassport = (j: unknown) => (((j as { summary?: { skills?: PassportSkill[] } })?.summary?.skills) ?? [])
const pickAttempts = (j: unknown) => (((j as { items?: Attempt[] })?.items) ?? [])
const pickPatterns = (j: unknown) => (((j as { items?: Pattern[] })?.items) ?? [])

const READINESS_KEY = { ready: 'dash.readinessReady', almost: 'dash.readinessAlmost', developing: 'dash.readinessDeveloping', not_yet: 'dash.readinessNotYet' } as const
const LEVEL_KEY = { beginner: 'dash.levelBeginner', intermediate: 'dash.levelIntermediate', advanced: 'dash.levelAdvanced', expert: 'dash.levelExpert' } as const
const DIFF_KEY = { easy: 'dash.levelEasy', moderate: 'dash.levelModerate', tough: 'dash.levelTough' } as const

function ErrorLine({ t }: { t: Translator }) {
  return <BentoEmpty tone="error" title={t('dash.bentoCouldntLoad')} />
}

export interface LearnerStats { loaded: boolean; failed: boolean; streak: number; xp: number; challenges: number; scans: number; fixes: number }

export function LearnerBento({ stats }: { stats: LearnerStats }) {
  const { t } = useT()
  const { formatDateTime } = useLocaleDates()
  const plan = useJson('/api/study-plan', pickPlan)
  const contests = useJson('/api/contests', pickContests)
  const sims = useJson('/api/interview-sim', pickSims)
  const passport = useJson('/api/passport', pickPassport)
  const attempts = useJson('/api/company-tests/attempts', pickAttempts)
  const patterns = useJson('/api/company-tests?all=1', pickPatterns)
  const loading = t('dash.bentoLoading')

  // Streak: the study plan's streak when there is a plan (it counts plan days too), else the activity streak.
  const streak = plan.data?.streak.current ?? stats.streak
  const streakLoading = plan.loading || (!plan.data && !stats.loaded && !stats.failed)

  const now = Date.now()
  const nextContest = (contests.data ?? [])
    .filter((c) => ['live', 'registration', 'upcoming'].includes(c.phase) && Date.parse(c.schedule.ends_at) > now)
    .sort((a, b) => Date.parse(a.schedule.starts_at) - Date.parse(b.schedule.starts_at))[0]

  const scored = (sims.data ?? []).filter((s) => s.overall != null).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const latestSim = scored[scored.length - 1]

  const skills = passport.data ?? []
  const top = skills[0]

  const target = plan.data?.plan.target.pattern_id
  const pats = patterns.data ?? []
  const tried = new Set((attempts.data ?? []).map((a) => a.patternId))
  const recommended =
    (target && pats.find((p) => p.id === target)) ||
    pats.find((p) => !tried.has(p.id) && p.levels.some((l) => l.ready) && p.verified) ||
    pats.find((p) => !tried.has(p.id) && p.levels.some((l) => l.ready)) ||
    null

  return (
    <section aria-label={t('dash.bentoOverview')}>
      <BentoGrid cols={4}>
        {/* Streak — the one brand-coloured card */}
        <BentoStat
          tone="brand"
          href="/dashboard/study-plan"
          icon={<Flame />}
          title={t('dash.bentoStreak')}
          loading={streakLoading}
          loadingLabel={loading}
          value={streak}
          unit={t('dash.bentoDaysUnit', { count: streak })}
          hint={streak > 0 ? (plan.data ? t('dash.bentoStreakLongest', { n: plan.data.streak.longest }) : undefined) : t('dash.bentoStreakStart')}
          action={t('dash.bentoStreakAction')}
        />

        {/* Today's study plan — tall list */}
        <BentoList
          span={2}
          smSpan={2}
          rows={2}
          icon={<CalendarCheck />}
          title={t('dash.bentoTodayPlan')}
          loading={plan.loading}
          loadingLabel={loading}
          more={plan.data ? { label: t('dash.bentoSeeAll'), href: '/dashboard/study-plan' } : undefined}
          items={(plan.data?.today_items ?? []).map((i) => ({
            key: i.id,
            primary: <span className={i.done_at ? 'text-muted-foreground line-through' : undefined}>{i.title}</span>,
            meta: i.done_at ? <BentoPill tone="live">{t('dash.bentoDone')}</BentoPill> : t('dash.bentoMinutes', { n: i.minutes }),
            href: i.href,
          }))}
          empty={
            plan.error ? <ErrorLine t={t} /> : !plan.data ? (
              <BentoEmpty title={t('dash.bentoNoPlanTitle')} text={t('dash.bentoNoPlanText')} actionLabel={t('dash.bentoNoPlanAction')} actionHref="/dashboard/study-plan" />
            ) : (
              <BentoEmpty title={t('dash.bentoPlanRestDay')} />
            )
          }
          className="[&_ul]:mb-auto"
        />

        {/* Interview readiness — ring + trend */}
        <BentoCard href={latestSim ? '/dashboard/interview-sim' : undefined} aria-busy={sims.loading || undefined}>
          <BentoBody className="pt-3">
            <div className="flex items-center gap-2.5">
              <BentoIcon><Mic /></BentoIcon>
              <BentoTitle className="text-[15px] font-medium text-muted-foreground">{t('dash.bentoReadiness')}</BentoTitle>
            </div>
            {sims.loading ? (
              <div className="mt-4 flex items-center gap-3"><span className="sr-only">{loading}</span><SkeletonBar className="h-16 w-16 rounded-full" /><SkeletonBar className="h-3 w-24" /></div>
            ) : sims.error ? (
              <div className="mt-3"><ErrorLine t={t} /></div>
            ) : !latestSim ? (
              <BentoEmpty className="mt-3" title={t('dash.bentoNoReadinessTitle')} text={t('dash.bentoNoReadinessText')} actionLabel={t('dash.bentoNoReadinessAction')} actionHref="/dashboard/interview-sim" />
            ) : (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <Meter value={latestSim.overall ?? 0} size={72}>
                    <span className="bento-num text-2xl">{Math.round(latestSim.overall ?? 0)}</span>
                  </Meter>
                  <div className="min-w-0">
                    {latestSim.readiness && <BentoPill tone={latestSim.readiness === 'ready' ? 'live' : latestSim.readiness === 'almost' ? 'warn' : 'muted'}>{t(READINESS_KEY[latestSim.readiness])}</BentoPill>}
                    <p className="mt-1.5 text-xs text-muted-foreground">{t('dash.bentoReadinessHint', { count: scored.length })}</p>
                  </div>
                </div>
                {scored.length > 1 && <Sparkline data={scored.slice(-8).map((s) => s.overall ?? 0)} label={t('dash.bentoReadinessTrend')} className="mt-auto pt-4" />}
              </>
            )}
          </BentoBody>
        </BentoCard>

        {/* Skill passport level */}
        <BentoCard href="/dashboard/passport" aria-busy={passport.loading || undefined}>
          <BentoBody className="pt-3">
            <div className="flex items-center gap-2.5">
              <BentoIcon><BadgeCheck /></BentoIcon>
              <BentoTitle className="text-[15px] font-medium text-muted-foreground">{t('dash.bentoPassport')}</BentoTitle>
            </div>
            {passport.loading ? (
              <div className="mt-4 space-y-2"><span className="sr-only">{loading}</span><SkeletonBar className="h-9 w-32" /><SkeletonBar className="h-3 w-2/3" /></div>
            ) : passport.error ? (
              <div className="mt-3"><ErrorLine t={t} /></div>
            ) : !top ? (
              <BentoEmpty className="mt-3" title={t('dash.bentoNoPassportTitle')} text={t('dash.bentoNoPassportText')} />
            ) : (
              <>
                <p className="bento-num mt-4 text-4xl">{t(LEVEL_KEY[top.level])}</p>
                <p className="mt-1.5 truncate text-sm text-muted-foreground">{t('dash.bentoPassportTop', { skill: top.skill })}</p>
                <ol className="mt-auto grid grid-cols-4 gap-1 pt-4" aria-hidden>
                  {(['beginner', 'intermediate', 'advanced', 'expert'] as const).map((l, i, all) => (
                    <li key={l} className={i <= all.indexOf(top.level) ? 'h-1.5 rounded-full bg-primary' : 'h-1.5 rounded-full bg-muted'} />
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">{t('dash.bentoPassportSkills', { count: skills.length })}</p>
              </>
            )}
          </BentoBody>
        </BentoCard>

        {/* Next contest */}
        <BentoCard href={nextContest ? `/contests/${nextContest.slug}` : undefined} aria-busy={contests.loading || undefined}>
          <BentoBody className="pt-3">
            <div className="flex items-center gap-2.5">
              <BentoIcon><AnimatedIcon name="clock" size={18} /></BentoIcon>
              <BentoTitle className="text-[15px] font-medium text-muted-foreground">{t('dash.bentoNextContest')}</BentoTitle>
            </div>
            {contests.loading ? (
              <div className="mt-4 space-y-2"><span className="sr-only">{loading}</span><SkeletonBar className="h-4 w-3/4" /><SkeletonBar className="h-3 w-1/2" /></div>
            ) : contests.error ? (
              <div className="mt-3"><ErrorLine t={t} /></div>
            ) : !nextContest ? (
              <BentoEmpty className="mt-3" title={t('dash.bentoNoContestTitle')} text={t('dash.bentoNoContestText')} actionLabel={t('dash.bentoSeeContests')} actionHref="/contests" />
            ) : (
              <>
                <p className="mt-4 line-clamp-2 text-base font-semibold leading-snug text-foreground">{nextContest.title}</p>
                <div className="mt-2">
                  {nextContest.phase === 'live'
                    ? <BentoPill tone="live">{t('dash.bentoContestLive')}</BentoPill>
                    : <BentoPill tone="accent">{t('dash.bentoContestStarts', { when: formatDateTime(nextContest.schedule.starts_at) })}</BentoPill>}
                </div>
                <div className="mt-auto"><BentoAction>{t('dash.bentoSeeContests')}</BentoAction></div>
              </>
            )}
          </BentoBody>
        </BentoCard>

        {/* Recent company test results */}
        <BentoList
          span={2}
          smSpan={2}
          icon={<Trophy />}
          title={t('dash.bentoRecentResults')}
          loading={attempts.loading}
          loadingLabel={loading}
          more={(attempts.data ?? []).length > 0 ? { label: t('dash.bentoSeeAll'), href: '/dashboard/company-tests' } : undefined}
          items={(attempts.data ?? []).slice(0, 4).map((a) => ({
            key: a.id,
            primary: a.examName,
            secondary: `${a.companyName} · ${t(DIFF_KEY[a.level])}`,
            meta:
              a.status !== 'completed' ? <BentoPill>{t('dash.bentoInProgress')}</BentoPill>
                : (
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{Math.round(a.result?.percent ?? 0)}%</span>
                    <BentoPill tone={a.result?.passed ? 'live' : 'warn'}>{a.result?.passed ? t('dash.bentoPassed') : t('dash.bentoBelowCutoff')}</BentoPill>
                  </span>
                ),
            href: `/dashboard/company-tests/${a.patternId}`,
          }))}
          empty={attempts.error ? <ErrorLine t={t} /> : <BentoEmpty title={t('dash.bentoNoResultsTitle')} text={t('dash.bentoNoResultsText')} />}
        />

        {/* Recommended company test */}
        <BentoCard span={2} smSpan={2} tone="tint" href={recommended ? `/dashboard/company-tests/${recommended.id}` : undefined} aria-busy={patterns.loading || undefined}>
          <BentoBody className="pt-3">
            <div className="flex items-center gap-2.5">
              <BentoIcon><Building2 /></BentoIcon>
              <BentoTitle className="text-[15px] font-medium text-muted-foreground">{t('dash.bentoRecommended')}</BentoTitle>
            </div>
            {patterns.loading || (attempts.loading && !patterns.error) ? (
              <div className="mt-4 space-y-2"><span className="sr-only">{loading}</span><SkeletonBar className="h-6 w-1/2" /><SkeletonBar className="h-3 w-2/3" /></div>
            ) : patterns.error ? (
              <div className="mt-3"><ErrorLine t={t} /></div>
            ) : !recommended ? (
              <BentoEmpty className="mt-3" title={t('dash.bentoNoTestsTitle')} text={t('dash.bentoNoTestsText')} />
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{recommended.examName}</p>
                <BentoText>{recommended.id === target ? t('dash.bentoRecommendedPlan') : t('dash.bentoRecommendedStart')}</BentoText>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <BentoPill>{t('dash.bentoSections', { count: recommended.sections.length })}</BentoPill>
                  <BentoPill>{t('dash.bentoMinutesTotal', { n: recommended.sections.reduce((a, s) => a + s.timeMinutes, 0) })}</BentoPill>
                </div>
                <div className="mt-auto"><BentoAction>{t('dash.bentoStartPractice')}</BentoAction></div>
              </>
            )}
          </BentoBody>
        </BentoCard>

        {/* Daily challenge keeps its own card; it just takes a bento slot */}
        <div data-hint="daily-challenge" className={`min-w-0 ${spanClass({ span: 2, smSpan: 2 })}`}>
          <DailyChallengeWidget />
        </div>

        <BentoStat
          icon={<Code />}
          title={t('dash.bentoProblemsSolved')}
          loading={!stats.loaded && !stats.failed}
          loadingLabel={loading}
          value={stats.failed ? '—' : stats.challenges}
          hint={stats.loaded ? t('dash.bentoSolvedHint', { scans: stats.scans, fixes: stats.fixes }) : undefined}
          href="/dashboard/problems"
        />
        <BentoStat
          icon={<AnimatedIcon name="bolt" size={18} />}
          title={t('dash.bentoXp')}
          loading={!stats.loaded && !stats.failed}
          loadingLabel={loading}
          value={stats.failed ? '—' : stats.xp.toLocaleString()}
          href="/dashboard/achievements"
        />
      </BentoGrid>
    </section>
  )
}

