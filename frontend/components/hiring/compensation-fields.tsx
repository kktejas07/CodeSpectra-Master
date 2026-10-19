'use client'

/**
 * Compensation inputs shared by the public apply form, the candidate's HR form
 * (/hr-form/[token]) and the recruiter edit on the candidate page. Controlled
 * string draft; `draftToBody` gives the body lib/ats/compensation parses.
 * Fresher → expected CTC (+ when they can join); experienced → current or last
 * drawn CTC, optional fixed/variable breakup, expected CTC, notice period.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { Compensation, ExperienceLevel } from '@/lib/ats/contract'
import { COMP_CURRENCIES, currencyForCountry, periodsFor } from '@/lib/ats/compensation'

export interface CompDraft {
  experience_level: ExperienceLevel | ''
  currency: string
  period: Compensation['period']
  current_ctc: string
  currently_employed: boolean
  fixed: string
  variable: string
  expected_ctc: string
  notice_days: string
  negotiable: boolean | null
}

export function emptyDraft(country?: string | null): CompDraft {
  return {
    experience_level: '', currency: currencyForCountry(country), period: 'year',
    current_ctc: '', currently_employed: true, fixed: '', variable: '', expected_ctc: '', notice_days: '', negotiable: null,
  }
}

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

export function draftFrom(c: Partial<Compensation> | null | undefined, country?: string | null): CompDraft {
  if (!c) return emptyDraft(country)
  return {
    experience_level: c.experience_level ?? '',
    currency: c.currency || currencyForCountry(country),
    period: c.period || 'year',
    current_ctc: s(c.current_ctc),
    currently_employed: c.currently_employed !== false,
    fixed: s(c.breakup?.fixed),
    variable: s(c.breakup?.variable),
    expected_ctc: s(c.expected_ctc),
    notice_days: s(c.notice_days),
    negotiable: c.negotiable ?? null,
  }
}

/** The JSON body for /api/ats/hr-form and /api/ats/applications/[id]/compensation. */
export function draftToBody(d: CompDraft): Record<string, unknown> {
  const experienced = d.experience_level === 'experienced'
  return {
    experience_level: d.experience_level,
    currency: d.currency,
    period: d.period,
    ...(experienced
      ? { current_ctc: d.current_ctc, currently_employed: d.currently_employed, breakup: { fixed: d.fixed, variable: d.variable } }
      : {}),
    expected_ctc: d.expected_ctc,
    notice_days: d.notice_days,
    ...(d.negotiable !== null ? { negotiable: d.negotiable } : {}),
  }
}

const digits = (v: string, max = 12) => v.replace(/[^\d.]/g, '').slice(0, max)

export function CompensationFields({
  value,
  onChange,
  idPrefix,
  hourlyAllowed = false,
  showNegotiable = false,
  labelClassName,
  compact = false,
}: {
  value: CompDraft
  onChange: (next: CompDraft) => void
  idPrefix: string
  hourlyAllowed?: boolean
  showNegotiable?: boolean
  labelClassName?: string
  compact?: boolean
}) {
  const d = value
  const set = (patch: Partial<CompDraft>) => onChange({ ...d, ...patch })
  const periods = periodsFor(d.currency, hourlyAllowed)
  const per = d.period === 'year' ? 'per year' : d.period === 'month' ? 'per month' : 'per hour'
  const lbl = cn('text-xs text-foreground', labelClassName)
  const id = (k: string) => `${idPrefix}-${k}`
  const experienced = d.experience_level === 'experienced'
  const fresher = d.experience_level === 'fresher'

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className={lbl}>Experience</legend>
        <div role="radiogroup" aria-label="Experience" className="grid grid-cols-2 gap-2">
          {(['fresher', 'experienced'] as const).map((lvl) => (
            <label
              key={lvl}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
                d.experience_level === lvl ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <input type="radio" name={id('level')} value={lvl} checked={d.experience_level === lvl} onChange={() => set({ experience_level: lvl })} className="sr-only" />
              {lvl === 'fresher' ? 'Fresher' : 'Experienced'}
            </label>
          ))}
        </div>
      </fieldset>

      {d.experience_level && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={id('currency')} className={lbl}>Currency</Label>
              <select
                id={id('currency')}
                value={d.currency}
                onChange={(e) => {
                  const currency = e.target.value
                  set({ currency, period: periodsFor(currency, hourlyAllowed).includes(d.period) ? d.period : 'year' })
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {[...new Set([d.currency, ...COMP_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id('period')} className={lbl}>Paid</Label>
              <select
                id={id('period')}
                value={d.period}
                onChange={(e) => set({ period: e.target.value as CompDraft['period'] })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {periods.map((p) => <option key={p} value={p}>{p === 'year' ? 'Per year' : p === 'month' ? 'Per month' : 'Per hour'}</option>)}
              </select>
            </div>
          </div>

          {experienced && (
            <>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <span className="text-sm text-foreground">I&apos;m currently employed</span>
                <Switch checked={d.currently_employed} onCheckedChange={(v) => set({ currently_employed: v })} aria-label="I'm currently employed" />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor={id('current')} className={lbl}>{d.currently_employed ? 'Current CTC' : 'Last drawn CTC'} ({per})</Label>
                <Input id={id('current')} inputMode="decimal" required value={d.current_ctc} onChange={(e) => set({ current_ctc: digits(e.target.value) })} />
              </div>
              <details className="rounded-xl border border-border px-3 py-2" open={!!(d.fixed || d.variable) && !compact}>
                <summary className="cursor-pointer text-sm text-muted-foreground">Breakup (optional)</summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={id('fixed')} className={lbl}>Fixed</Label>
                    <Input id={id('fixed')} inputMode="decimal" value={d.fixed} onChange={(e) => set({ fixed: digits(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={id('variable')} className={lbl}>Variable / bonus</Label>
                    <Input id={id('variable')} inputMode="decimal" value={d.variable} onChange={(e) => set({ variable: digits(e.target.value) })} />
                  </div>
                </div>
              </details>
            </>
          )}

          <div className={cn('grid gap-2', experienced ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
            <div className="space-y-1.5">
              <Label htmlFor={id('expected')} className={lbl}>Expected CTC ({per}){experienced ? ' — optional' : ''}</Label>
              <Input id={id('expected')} inputMode="decimal" required={fresher} value={d.expected_ctc} onChange={(e) => set({ expected_ctc: digits(e.target.value) })} />
            </div>
            {(!experienced || d.currently_employed) && (
              <div className="space-y-1.5">
                <Label htmlFor={id('notice')} className={lbl}>{fresher ? 'Can join in (days)' : 'Notice period (days)'}</Label>
                <Input id={id('notice')} inputMode="numeric" placeholder={fresher ? '0' : '30'} value={d.notice_days} onChange={(e) => set({ notice_days: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })} />
              </div>
            )}
          </div>

          {showNegotiable && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="text-sm text-foreground">My expectation is negotiable</span>
              <Switch checked={d.negotiable === true} onCheckedChange={(v) => set({ negotiable: v })} aria-label="My expectation is negotiable" />
            </label>
          )}
        </>
      )}
    </div>
  )
}
