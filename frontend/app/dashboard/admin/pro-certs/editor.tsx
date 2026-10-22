'use client'

/**
 * Certification editor: details, blueprint sections (domains from the question
 * bot, question types, difficulty mix, optional section minutes), pass mark,
 * proctoring threshold + review policy, attempt policy, price (entered in
 * rupees / dollars, stored in minor units) and validity. Shows approved-bank
 * coverage per section. The server re-validates everything (zod).
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/app/page-kit'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { DEFAULT_DOMAINS } from '@/lib/question-bot/domains'
import { PROGRAM_LEVELS, SECTION_TYPES, type BlueprintSection, type ProgramDoc, type ProgramInput } from '@/lib/pro-certs/types'

type Api = <T>(url: string, init?: { method?: string; body?: unknown }) => Promise<T>
type Coverage = Array<{ section: string; need: Record<string, number>; have: Record<string, number> }>

const field = 'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function toInput(p: ProgramDoc): ProgramInput {
  const { slug, title, summary, description, level, skills, blueprint, proctoring, attempts, price, validity_months, renewal_window_days } = p
  return { slug, title, summary, description, level, skills, blueprint, proctoring, attempts, price, validity_months, renewal_window_days }
}

export function ProgramEditor({ id, api, onClose }: { id: string; api: Api; onClose: () => void }) {
  const { t, td } = useAdminT()
  const addToast = useToast()
  const [p, setP] = useState<ProgramInput | null>(null)
  const [status, setStatus] = useState('draft')
  const [coverage, setCoverage] = useState<Coverage>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api<{ program: ProgramDoc; coverage: Coverage }>(`/api/admin/pro-certs/${id}`)
      .then((r) => { setP(toInput(r.program)); setStatus(r.program.status); setCoverage(r.coverage) })
      .catch((e) => setErr((e as Error).message))
  }, [id, api])

  if (err) return <p role="alert" className="text-sm text-destructive">{err}</p>
  if (!p) return <p className="text-sm text-muted-foreground" role="status">{t('pcert.loading')}</p>

  const set = (patch: Partial<ProgramInput>) => setP({ ...p, ...patch })
  const setSection = (i: number, patch: Partial<BlueprintSection>) => set({ blueprint: { ...p.blueprint, sections: p.blueprint.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) } })
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const money = (v: number | null) => (v === null ? '' : String(v / 100))
  const toMinor = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s) * 100)) || 0)
  const num = (s: string) => Math.max(0, Math.floor(Number(s) || 0))

  const save = async () => {
    setBusy(true)
    try {
      const r = await api<{ program: ProgramDoc; coverage: Coverage }>(`/api/admin/pro-certs/${id}`, { method: 'PUT', body: { program: p } })
      setCoverage(r.coverage)
      addToast({ type: 'success', title: t('pcert.saved') })
    } catch (e) {
      addToast({ type: 'error', title: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">{t('pcert.details')} <span className="text-sm font-normal text-muted-foreground">· {td(`pcert.status.${status}`, status)}</span></h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('pcert.back')}</Button>
            <Button onClick={() => void save()} disabled={busy}>{t('pcert.save')}</Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fTitle')}</span><Input value={p.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fSlug')}</span><Input value={p.slug} maxLength={60} disabled={status === 'published'} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-foreground">{t('pcert.fSummary')}</span><Textarea rows={2} maxLength={400} value={p.summary} onChange={(e) => set({ summary: e.target.value })} /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium text-foreground">{t('pcert.fDescription')}</span><Textarea rows={4} maxLength={4000} value={p.description} onChange={(e) => set({ description: e.target.value })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fLevel')}</span>
            <select className={field} value={p.level} onChange={(e) => set({ level: e.target.value as ProgramInput['level'] })}>
              {PROGRAM_LEVELS.map((l) => <option key={l} value={l}>{td(`pcert.level.${l}`, l)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fSkills')}</span><Input value={p.skills.join(', ')} onChange={(e) => set({ skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10) })} /></label>
        </div>
      </Panel>

      <Panel className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">{t('pcert.blueprint')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fDuration')}</span><Input type="number" min={10} max={300} value={p.blueprint.duration_min} onChange={(e) => set({ blueprint: { ...p.blueprint, duration_min: num(e.target.value) } })} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fPass')}</span><Input type="number" min={30} max={100} value={p.blueprint.pass_percent} onChange={(e) => set({ blueprint: { ...p.blueprint, pass_percent: num(e.target.value) } })} /></label>
        </div>
        {p.blueprint.sections.map((s, i) => {
          const cov = coverage.find((c) => c.section === s.id)
          return (
            <fieldset key={i} className="space-y-3 rounded-2xl border border-border/70 p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">{t('pcert.section', { n: i + 1 })}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('pcert.fSectionId')}</span><Input value={s.id} maxLength={40} onChange={(e) => setSection(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></label>
                <label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('pcert.fSectionName')}</span><Input value={s.name} maxLength={80} onChange={(e) => setSection(i, { name: e.target.value })} /></label>
                <label className="space-y-1 text-sm"><span className="text-muted-foreground">{t('pcert.fSectionMinutes')}</span><Input type="number" min={0} max={300} value={s.minutes ?? ''} onChange={(e) => setSection(i, { minutes: e.target.value === '' ? null : num(e.target.value) || null })} /></label>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('pcert.fDomains')}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DEFAULT_DOMAINS.map((d) => (
                    <label key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-xs">
                      <input type="checkbox" checked={s.domains.includes(d.id)} onChange={() => setSection(i, { domains: toggle(s.domains, d.id) })} />{d.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('pcert.fTypes')}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SECTION_TYPES.map((ty) => (
                    <label key={ty} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-xs">
                      <input type="checkbox" checked={s.types.includes(ty)} onChange={() => setSection(i, { types: toggle(s.types, ty) })} /><span className="font-mono">{ty}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
                  <label key={d} className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{td(`pcert.diff.${d}`, d)}</span>
                    <Input type="number" min={0} max={200} value={s.difficulty[d]} onChange={(e) => setSection(i, { difficulty: { ...s.difficulty, [d]: num(e.target.value) } })} />
                    {cov && <span className={`block text-xs tabular-nums ${cov.have[d] < s.difficulty[d] ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>{t('pcert.inBank', { n: cov.have[d] ?? 0 })}</span>}
                  </label>
                ))}
              </div>
              {p.blueprint.sections.length > 1 && (
                <Button variant="outline" size="sm" onClick={() => set({ blueprint: { ...p.blueprint, sections: p.blueprint.sections.filter((_, j) => j !== i) } })}>{t('pcert.removeSection')}</Button>
              )}
            </fieldset>
          )
        })}
        {p.blueprint.sections.length < 8 && (
          <Button variant="outline" onClick={() => set({ blueprint: { ...p.blueprint, sections: [...p.blueprint.sections, { id: `s${p.blueprint.sections.length + 1}`, name: '', domains: [], subjects: [], types: ['mcq'], difficulty: { Easy: 5, Medium: 5, Hard: 0 }, minutes: null }] } })}>{t('pcert.addSection')}</Button>
        )}
      </Panel>

      <Panel className="grid gap-4 sm:grid-cols-3">
        <h2 className="text-base font-semibold text-foreground sm:col-span-3">{t('pcert.rulesAndPrice')}</h2>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fMinTrust')}</span><Input type="number" min={0} max={100} value={p.proctoring.min_trust} onChange={(e) => set({ proctoring: { ...p.proctoring, min_trust: Math.min(100, num(e.target.value)) } })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fReview')}</span>
          <select className={field} value={p.proctoring.review} onChange={(e) => set({ proctoring: { ...p.proctoring, review: e.target.value as 'always' | 'below_threshold' } })}>
            <option value="always">{t('pcert.reviewAlways')}</option>
            <option value="below_threshold">{t('pcert.reviewBelow')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={p.proctoring.strict_extension} onChange={(e) => set({ proctoring: { ...p.proctoring, strict_extension: e.target.checked } })} />{t('pcert.fStrict')}</label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fCooldown')}</span><Input type="number" min={0} max={365} value={p.attempts.cooldown_days} onChange={(e) => set({ attempts: { ...p.attempts, cooldown_days: num(e.target.value) } })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fMaxYear')}</span><Input type="number" min={1} max={12} value={p.attempts.max_per_year} onChange={(e) => set({ attempts: { ...p.attempts, max_per_year: Math.max(1, num(e.target.value)) } })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fValidity')}</span><Input type="number" min={6} max={60} value={p.validity_months} onChange={(e) => set({ validity_months: num(e.target.value) })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fPriceInr')}</span><Input inputMode="decimal" value={money(p.price.INR)} onChange={(e) => set({ price: { ...p.price, INR: toMinor(e.target.value) } })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fPriceUsd')}</span><Input inputMode="decimal" value={money(p.price.USD)} onChange={(e) => set({ price: { ...p.price, USD: toMinor(e.target.value) } })} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium text-foreground">{t('pcert.fRenewalWindow')}</span><Input type="number" min={0} max={365} value={p.renewal_window_days} onChange={(e) => set({ renewal_window_days: num(e.target.value) })} /></label>
      </Panel>
    </div>
  )
}
