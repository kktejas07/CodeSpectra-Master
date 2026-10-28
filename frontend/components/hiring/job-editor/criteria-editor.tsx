'use client'

/** Screening criteria: skills, keywords, experience, location, notice, education, salary, weights, pass score. */
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ScreeningCriteria } from '@/lib/ats/contract'
import { DEFAULT_WEIGHTS } from '../lib/pipeline-builder'
import { MATCH_WEIGHT_LABELS, type MatchWeightKey } from '../lib/labels'
import { ChipInput, Field } from '../ui'
import { useT } from '@/lib/i18n/client'

const n = (v: string) => (v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export function CriteriaEditor({
  value,
  onChange,
  skillSuggestions,
  currency,
}: {
  value: ScreeningCriteria
  onChange: (patch: Partial<ScreeningCriteria>) => void
  skillSuggestions?: string[]
  currency?: string
}) {
  const { t } = useT()
  const weights = { ...DEFAULT_WEIGHTS, ...value.weights }
  const total = (Object.keys(MATCH_WEIGHT_LABELS) as MatchWeightKey[])
    .filter((k) => k !== 'ai' || value.use_ai_match)
    .reduce((s, k) => s + (weights[k] ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChipInput
          label={t('hiring.mustHaveSkills')}
          value={value.must_have_skills}
          onChange={(v) => onChange({ must_have_skills: v })}
          placeholder={t('hiring.eGReactNodeJs')}
          suggestions={skillSuggestions?.filter((s) => !value.nice_to_have_skills.includes(s))}
        />
        <ChipInput label={t('hiring.niceToHaveSkills')} value={value.nice_to_have_skills} onChange={(v) => onChange({ nice_to_have_skills: v })} placeholder={t('hiring.eGGraphql')} />
        <ChipInput label={t('hiring.keywords')} value={value.keywords} onChange={(v) => onChange({ keywords: v })} placeholder={t('hiring.eGFintechPayments')} hint={t('hiring.searchedAnywhereInTheRSum')} />
        <ChipInput label={t('hiring.acceptedLocations')} value={value.locations ?? []} onChange={(v) => onChange({ locations: v })} placeholder={t('hiring.eGHyderabadRemote')} hint={t('hiring.leaveEmptyToAcceptAnyLocation')} />
        <ChipInput label={t('hiring.education')} value={value.education ?? []} onChange={(v) => onChange({ education: v })} placeholder={t('hiring.eGBTechMca')} suggestions={['B.Tech', 'B.E.', 'M.Tech', 'MCA', 'B.Sc', 'MBA']} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('hiring.minimumYears')} htmlFor="cr-min">
          <Input id="cr-min" type="number" min={0} max={50} value={value.min_years ?? ''} onChange={(e) => onChange({ min_years: n(e.target.value) })} />
        </Field>
        <Field label={t('hiring.maximumYears')} htmlFor="cr-max">
          <Input id="cr-max" type="number" min={0} max={50} value={value.max_years ?? ''} onChange={(e) => onChange({ max_years: n(e.target.value) })} />
        </Field>
        <Field label={t('hiring.longestNoticeDays')} htmlFor="cr-notice">
          <Input id="cr-notice" type="number" min={0} max={180} value={value.max_notice_days ?? ''} onChange={(e) => onChange({ max_notice_days: n(e.target.value) })} />
        </Field>
        <Field label={t('hiring.salaryCapValue', { value: currency ? ` (${currency})` : '' })} htmlFor="cr-sal" hint={t('hiring.highestExpectedSalaryPerYear')}>
          <Input id="cr-sal" type="number" min={0} value={value.max_expected_salary ?? ''} onChange={(e) => onChange({ max_expected_salary: n(e.target.value) })} />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <ToggleRow label={t('hiring.openToRelocationCounts')} hint={t('hiring.candidatesElsewhereWhoWillRelocateStill372')} checked={value.relocation_ok ?? true} onChange={(v) => onChange({ relocation_ok: v })} />
        <ToggleRow label={t('hiring.everyMustHaveRequired')} hint={t('hiring.missingAnyMustHaveFailsThe327')} checked={value.must_have_required} onChange={(v) => onChange({ must_have_required: v })} />
        <ToggleRow label={t('hiring.useAiFitScore')} hint={t('hiring.addsAnAiRSumTodd5')} checked={value.use_ai_match} onChange={(v) => onChange({ use_ai_match: v })} />
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{t('hiring.howMuchEachPartCounts')}</p>
          <p className="text-xs text-muted-foreground">{t('hiring.weightsAreRelativeTotal')}{' '}<span className="tabular-nums">{total}</span></p>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(Object.keys(MATCH_WEIGHT_LABELS) as MatchWeightKey[]).map((k) => {
            const disabled = k === 'ai' && !value.use_ai_match
            const pct = total > 0 && !disabled ? Math.round(((weights[k] ?? 0) / total) * 100) : 0
            return (
              <div key={k} className={disabled ? 'opacity-50' : undefined}>
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={`w-${k}`} className="text-foreground">{MATCH_WEIGHT_LABELS[k]}</label>
                  <span className="tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <input
                  id={`w-${k}`}
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  disabled={disabled}
                  value={weights[k] ?? 0}
                  onChange={(e) => onChange({ weights: { ...weights, [k]: Number(e.target.value) } })}
                  className="w-full accent-primary"
                  aria-valuetext={`${weights[k]} (${pct}%)`}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="max-w-md">
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="cr-pass" className="font-medium text-foreground">{t('hiring.passScore')}</label>
          <span className="font-semibold tabular-nums text-foreground">{value.pass_score}</span>
        </div>
        <input
          id="cr-pass"
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.pass_score}
          onChange={(e) => onChange({ pass_score: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">{t('hiring.candidatesAtOrAboveThisMatchfc3')}</p>
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5" />
    </label>
  )
}
