/**
 * Landing "what's in the platform" bento (server component, zero client JS).
 * Every number is counted from the code that powers the feature — question
 * types, seeded company patterns, contest formats, site languages — so the
 * page can never claim more than the product does.
 *
 * Visuals are small HTML/CSS fragments of the real UI inside each card's well
 * (no images → no LCP or CLS cost). Sample content inside wells (a question,
 * an interview line) is decorative and stays in English, like ResultsSheet.
 */
import { Bot, Building2, CalendarClock, GraduationCap, Languages, ListChecks, MessageCircle, ShieldCheck, Swords, BadgeCheck, Users } from 'lucide-react'
import { BentoAction, BentoBody, BentoCard, BentoCta, BentoFeature, BentoGrid, BentoIcon, BentoProof, BentoText, BentoTitle, BentoWell, Meter } from '@/components/bento'
import { BANK_QUESTION_TYPES } from '@/lib/question-types'
import { SEED_PATTERNS } from '@/lib/company-tests/seed-patterns'
import { FORMATS } from '@/lib/contests/formats'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { cn } from '@/lib/utils'

export const PLATFORM_COUNTS = {
  questionTypes: BANK_QUESTION_TYPES.length,
  companyPatterns: SEED_PATTERNS.length,
  contestFormats: Object.keys(FORMATS).length,
  languages: LOCALES.length,
}

/* ── Well visuals ────────────────────────────────────────────────────── */

function QuestionStack() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-5" lang="en">
      {/* back sheets: a code question and an SQL question peeking out */}
      <div className="absolute left-1/2 top-1/2 w-[78%] max-w-[360px] -translate-x-[54%] -translate-y-[58%] -rotate-6 rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <p><span className="text-primary">def</span> two_sum(nums, target):</p>
          <p className="pl-4">seen = {'{}'}</p>
          <p className="pl-4"><span className="text-primary">for</span> i, n <span className="text-primary">in</span> enumerate(nums):</p>
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 w-[78%] max-w-[360px] -translate-x-[46%] -translate-y-[52%] rotate-3 rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
        <p className="font-mono text-[11px] text-muted-foreground"><span className="text-primary">SELECT</span> name, score <span className="text-primary">FROM</span> results</p>
      </div>
      {/* front sheet: a multiple-choice question mid-answer */}
      <div className="relative w-[82%] max-w-[380px] rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_-16px_rgba(15,23,41,0.35)]">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span>Question 4 of 20</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">3 pts</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-foreground">What does git rebase do?</p>
        <ul className="mt-3 space-y-1.5 text-xs">
          {['Merges two branches with a merge commit', 'Replays your commits on top of another base', 'Deletes the remote branch'].map((o, i) => (
            <li key={o} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', i === 1 ? 'border-primary bg-primary/8 text-foreground' : 'border-border text-muted-foreground')}>
              <span className={cn('h-3 w-3 shrink-0 rounded-full border', i === 1 ? 'border-[4px] border-primary' : 'border-muted-foreground/50')} />
              <span className="truncate">{o}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function InterviewVisual({ ready }: { ready: string }) {
  return (
    <div className="absolute inset-0 grid grid-cols-[1fr_auto] items-center gap-4 p-4 sm:p-5">
      <div className="min-w-0 space-y-2" lang="en">
        <p className="max-w-[260px] rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-xs text-foreground shadow-sm">How would you design a URL shortener that handles a million links a day?</p>
        <div className="ml-auto flex w-fit items-center gap-[3px] rounded-2xl rounded-tr-md bg-primary px-3 py-2.5 text-primary-foreground">
          {[6, 12, 18, 10, 16, 8, 14, 20, 9, 13, 7].map((h, i) => (
            <span key={i} className="w-[3px] rounded-full bg-current" style={{ height: h }} />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Meter value={78} size={76}>
          <span className="bento-num text-2xl">78</span>
        </Meter>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">{ready}</span>
      </div>
    </div>
  )
}

function ProctorVisual({ checks, trust }: { checks: string[]; trust: string }) {
  return (
    <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 p-4 sm:p-5">
      {/* webcam frame: dark in both themes */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#0f1729]">
        <div className="absolute left-1/2 top-[30%] h-[34%] w-[26%] -translate-x-1/2 rounded-full bg-slate-500/50" />
        <div className="absolute left-1/2 top-[64%] h-[40%] w-[52%] -translate-x-1/2 rounded-t-[40%] bg-slate-500/40" />
        <div className="absolute left-1/2 top-[18%] h-[56%] w-[44%] -translate-x-1/2 rounded-lg border-2 border-[#5b84ff]" />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          REC
        </span>
      </div>
      <div className="min-w-0 space-y-1.5">
        {checks.slice(0, 3).map((c) => (
          <div key={c} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
            <span className="truncate">{c}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-foreground">
          <span className="truncate">{trust}</span>
          <span className="bento-num text-lg text-primary">92</span>
        </div>
      </div>
    </div>
  )
}

function PatternBars() {
  const rows = SEED_PATTERNS.slice(0, 3)
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 p-4 sm:p-5" lang="en">
      {rows.map((p) => {
        const total = p.sections.reduce((a, s) => a + s.timeMinutes, 0) || 1
        return (
          <div key={p.id} className="min-w-0">
            <p className="mb-1 truncate text-[11px] font-semibold text-foreground">{p.examName}</p>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {p.sections.map((s, i) => (
                <span key={s.name} className="h-full bg-primary" style={{ width: `${(s.timeMinutes / total) * 100}%`, opacity: 0.35 + (i % 3) * 0.25 }} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FormatCloud() {
  const labels = Object.values(FORMATS).map((f) => f.label.replace(/\s*\(.*\)$/, ''))
  return (
    <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-1.5 p-4" lang="en">
      {labels.map((l, i) => (
        <span key={l} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', i === 3 ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>{l}</span>
      ))}
    </div>
  )
}

function PassportVisual({ levels, verified }: { levels: string[]; verified: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="w-full max-w-[260px] rounded-2xl border border-border bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground" lang="en">Python</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/12 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
            <BadgeCheck className="h-3 w-3" />
            {verified}
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1">
          {levels.map((l, i) => (
            <li key={l} className="min-w-0">
              <span className={cn('block h-1.5 rounded-full', i <= 2 ? 'bg-primary' : 'bg-muted')} />
              <span className={cn('mt-1 block truncate text-[10px]', i === 2 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{l}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function CampusVisual({ drive, eligible }: { drive: string; eligible: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="w-full max-w-[260px] rounded-2xl border border-border bg-card p-3.5 shadow-sm">
        <p className="text-[11px] font-medium text-muted-foreground">{drive}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground" lang="en">Graduate engineer trainee</p>
        <div className="mt-3 flex flex-wrap gap-1.5" lang="en">
          {['CGPA ≥ 7.0', '0 backlogs', 'CSE · ECE'].map((c) => (
            <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-foreground">{c}</span>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-400">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {eligible}
        </p>
      </div>
    </div>
  )
}

function MentorsVisual({ slot }: { slot: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      <div className="flex -space-x-2" aria-hidden>
        {['bg-primary', 'bg-sky-500', 'bg-indigo-400', 'bg-blue-300'].map((c, i) => (
          <span key={i} className={cn('h-9 w-9 rounded-full border-2 border-card', c)} />
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px] shadow-sm">
        <CalendarClock className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{slot}</span>
        <span className="tabular-nums text-muted-foreground">45 min</span>
      </div>
      <div className="flex gap-1.5 text-[11px] tabular-nums" lang="en">
        {['10:00', '14:30', '18:00'].map((t, i) => (
          <span key={t} className={cn('rounded-lg px-2 py-1', i === 1 ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>{t}</span>
        ))}
      </div>
    </div>
  )
}

function WhatsappVisual({ correct }: { correct: string }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2 p-4">
      <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-[11px] text-foreground shadow-sm" lang="en">
        Q. Which data structure gives O(1) average lookup by key? A) Array B) Hash map C) Linked list
      </p>
      <p className="ml-auto rounded-2xl rounded-tr-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">B</p>
      <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-[11px] text-foreground shadow-sm">{correct}</p>
    </div>
  )
}

function LanguagesVisual() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-5 p-4 text-foreground sm:gap-8">
      <span className="bento-num text-6xl" lang="en">Aa</span>
      <span className="text-5xl font-bold text-primary" lang="hi">अ</span>
      <span className="text-5xl font-bold" lang="te">అ</span>
    </div>
  )
}

/* ── Grid ────────────────────────────────────────────────────────────── */

export function ProductBento({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const n = PLATFORM_COUNTS
  const chips = [t('landing.bentoChipMcq'), t('landing.bentoChipCoding'), t('landing.bentoChipSql'), t('landing.bentoChipMatching'), t('landing.bentoChipHotspot'), t('landing.bentoChipVideo'), t('landing.bentoChipEssay'), t('landing.bentoChipTyping')]
  const levels = [t('landing.bentoLevelBeginner'), t('landing.bentoLevelIntermediate'), t('landing.bentoLevelAdvanced'), t('landing.bentoLevelExpert')]
  const checks = [t('public.bentoCheckFace'), t('public.bentoCheckTabs'), t('public.bentoCheckPaste')]

  return (
    <BentoGrid cols={6}>
      {/* The one big card: the assessment itself */}
      <BentoCard span={3} rows={2} smSpan={2} href={lp('/features')}>
        <BentoWell className="h-64 sm:h-72 lg:h-auto lg:flex-1 lg:min-h-80">
          <QuestionStack />
        </BentoWell>
        <BentoBody className="flex-none">
          <div className="flex items-start gap-3">
            <BentoIcon><ListChecks /></BentoIcon>
            <div className="min-w-0">
              <BentoTitle>{t('landing.bentoAssessTitle', { n: n.questionTypes })}</BentoTitle>
              <BentoText>{t('landing.bentoAssessBody')}</BentoText>
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li key={c} className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">{c}</li>
            ))}
          </ul>
          <BentoAction>{t('landing.bentoAssessAction')}</BentoAction>
        </BentoBody>
      </BentoCard>

      <BentoFeature
        span={3}
        smSpan={2}
        href="/dashboard/interview-sim"
        icon={<Bot />}
        title={t('landing.bentoInterviewTitle')}
        text={t('landing.bentoInterviewBody')}
        visual={<InterviewVisual ready={t('landing.bentoInterviewReady')} />}
        wellClassName="h-36 sm:h-40"
      />

      <BentoFeature
        span={3}
        smSpan={2}
        icon={<ShieldCheck />}
        title={t('landing.bentoProctorTitle')}
        text={t('landing.bentoProctorBody')}
        visual={<ProctorVisual checks={checks} trust={t('landing.bentoProctorTrust')} />}
        wellClassName="h-40 sm:h-44"
      />

      <BentoFeature
        span={2}
        href={lp('/companies')}
        icon={<Building2 />}
        title={t('landing.bentoCompanyTitle', { n: n.companyPatterns })}
        text={t('landing.bentoCompanyBody')}
        visual={<PatternBars />}
        action={t('landing.bentoCompanyAction')}
      />

      <BentoFeature
        span={2}
        href={lp('/contests')}
        icon={<Swords />}
        title={t('landing.bentoContestTitle', { n: n.contestFormats })}
        text={t('landing.bentoContestBody')}
        visual={<FormatCloud />}
        action={t('landing.bentoContestAction')}
      />

      <BentoFeature
        span={2}
        smSpan={2}
        href="/dashboard/passport"
        icon={<BadgeCheck />}
        title={t('landing.bentoPassportTitle')}
        text={t('landing.bentoPassportBody')}
        visual={<PassportVisual levels={levels} verified={t('landing.bentoVerified')} />}
      />

      <BentoFeature
        span={2}
        href="/dashboard/campus"
        icon={<GraduationCap />}
        title={t('landing.bentoCampusTitle')}
        text={t('landing.bentoCampusBody')}
        visual={<CampusVisual drive={t('landing.bentoCampusDrive')} eligible={t('landing.bentoCampusEligible')} />}
      />

      <BentoFeature
        span={2}
        href={lp('/mentors')}
        icon={<Users />}
        title={t('landing.bentoMentorsTitle')}
        text={t('landing.bentoMentorsBody')}
        visual={<MentorsVisual slot={t('landing.bentoMentorsSlot')} />}
      />

      <BentoFeature
        span={2}
        smSpan={2}
        href="/dashboard/settings/whatsapp-practice"
        icon={<MessageCircle />}
        title={t('landing.bentoWhatsappTitle')}
        text={t('landing.bentoWhatsappBody')}
        visual={<WhatsappVisual correct={t('landing.bentoWhatsappCorrect')} />}
      />

      <BentoFeature
        span={2}
        icon={<Languages />}
        title={t('landing.bentoLangTitle')}
        text={t('landing.bentoLangBody')}
        visual={<LanguagesVisual />}
        wellClassName="h-32 sm:h-36"
      />

      <BentoProof
        span={2}
        title={t('landing.bentoProofTitle')}
        items={[
          { value: n.questionTypes, label: t('landing.bentoProofTypes') },
          { value: n.companyPatterns, label: t('landing.bentoProofPatterns') },
          { value: n.contestFormats, label: t('landing.bentoProofFormats') },
          { value: n.languages, label: t('landing.bentoProofLanguages') },
        ]}
      />

      <BentoCta
        span={2}
        smSpan={2}
        title={t('landing.bentoCtaTitle')}
        text={t('landing.bentoCtaBody')}
        primary={{ label: t('landing.startPractising'), href: '/auth/signup' }}
        secondary={{ label: t('public.bookPilot'), href: lp('/contact') }}
      />
    </BentoGrid>
  )
}

/** Pricing page: what every plan is built on — the same features, compact (no wells). */
export function PricingFeatureBento({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const n = PLATFORM_COUNTS
  return (
    <BentoGrid cols={6}>
      <BentoFeature span={3} smSpan={2} tone="tint" icon={<ListChecks />} title={t('landing.bentoAssessTitle', { n: n.questionTypes })} text={t('landing.bentoAssessBody')} href={lp('/features')} action={t('landing.bentoAssessAction')} />
      <BentoFeature span={3} smSpan={2} icon={<ShieldCheck />} title={t('landing.bentoProctorTitle')} text={t('landing.bentoProctorBody')} />
      <BentoFeature span={2} icon={<Bot />} title={t('landing.bentoInterviewTitle')} text={t('landing.bentoInterviewBody')} />
      <BentoFeature span={2} icon={<Building2 />} title={t('landing.bentoCompanyTitle', { n: n.companyPatterns })} text={t('landing.bentoCompanyBody')} href={lp('/companies')} />
      <BentoFeature span={2} smSpan={2} icon={<Swords />} title={t('landing.bentoContestTitle', { n: n.contestFormats })} text={t('landing.bentoContestBody')} href={lp('/contests')} />
      <BentoFeature span={2} icon={<BadgeCheck />} title={t('landing.bentoPassportTitle')} text={t('landing.bentoPassportBody')} />
      <BentoFeature span={2} icon={<GraduationCap />} title={t('landing.bentoCampusTitle')} text={t('landing.bentoCampusBody')} />
      <BentoFeature span={2} smSpan={2} icon={<Languages />} title={t('landing.bentoLangTitle')} text={t('landing.bentoLangBody')} />
    </BentoGrid>
  )
}
