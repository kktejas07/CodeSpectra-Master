'use client'

/**
 * Admin → Company patterns: the company exam pattern library and the company
 * test bot. Edit each pattern (sections, timing, negative marking, cut-off,
 * source), build its Easy / Moderate / Tough versions from the question bank
 * (optionally letting the AI fill the shortfall as drafts for review), and
 * switch the weekly refresh on or off within the AI caps.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LEVEL_LABEL, type CompanyExamPattern, type CompanyTestSettings, type VersionSummary } from '@/lib/company-tests/types'

type Item = CompanyExamPattern & { versions: VersionSummary[] }
interface Usage { today: number; monthCostUsd: number; dailyCap: number; monthlyCapUsd: number; remaining: number }

interface SectionForm { id?: string; name: string; questionCount: string; timeMinutes: string; questionTypes: string; categories: string; cutoffPercent: string }
interface PatternForm {
  id: string; companySlug: string; companyName: string; examName: string; negativeMarking: string; cutoffPercent: string
  notes: string; sourceUrl: string; lastReviewed: string; verified: boolean; active: boolean; sections: SectionForm[]
}

const emptySection = (): SectionForm => ({ name: '', questionCount: '10', timeMinutes: '15', questionTypes: 'mcq', categories: '', cutoffPercent: '' })
const emptyForm = (): PatternForm => ({
  id: '', companySlug: '', companyName: '', examName: '', negativeMarking: '0', cutoffPercent: '60',
  notes: '', sourceUrl: '', lastReviewed: '', verified: false, active: true, sections: [emptySection()],
})
const toForm = (p: CompanyExamPattern): PatternForm => ({
  id: p.id, companySlug: p.companySlug, companyName: p.companyName, examName: p.examName,
  negativeMarking: String(p.negativeMarking), cutoffPercent: String(p.cutoffPercent),
  notes: p.notes || '', sourceUrl: p.sourceUrl || '', lastReviewed: p.lastReviewed || '', verified: p.verified, active: p.active,
  sections: p.sections.map((s) => ({
    id: s.id, name: s.name, questionCount: String(s.questionCount), timeMinutes: String(s.timeMinutes),
    questionTypes: s.questionTypes.join(', '), categories: s.categories.join(', '), cutoffPercent: s.cutoffPercent === undefined ? '' : String(s.cutoffPercent),
  })),
})
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const fromForm = (f: PatternForm) => ({
  ...(f.id ? { id: f.id.trim() } : {}),
  companySlug: f.companySlug.trim(), companyName: f.companyName.trim(), examName: f.examName.trim(),
  negativeMarking: Number(f.negativeMarking) || 0, cutoffPercent: Number(f.cutoffPercent) || 0,
  notes: f.notes.trim() || undefined, sourceUrl: f.sourceUrl.trim(), lastReviewed: f.lastReviewed.trim(),
  verified: f.verified, active: f.active,
  sections: f.sections.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    name: s.name.trim(), questionCount: Number(s.questionCount) || 0, timeMinutes: Number(s.timeMinutes) || 0,
    questionTypes: list(s.questionTypes), categories: list(s.categories).map((c) => c.toLowerCase()),
    ...(s.cutoffPercent.trim() ? { cutoffPercent: Number(s.cutoffPercent) } : {}),
  })),
})

function LevelChip({ v }: { v: VersionSummary }) {
  const tone = !v.built ? 'text-muted-foreground' : v.complete ? 'border-green-500/40 text-green-700 dark:text-green-400' : 'border-amber-500/40 text-amber-700 dark:text-amber-400'
  return (
    <Badge variant="outline" className={tone} title={v.built ? `${v.pending} drafts waiting for review, ${v.missing} still missing` : 'Not built yet'}>
      {LEVEL_LABEL[v.level]}: <span className="ml-1 tabular-nums">{v.built ? `${v.questions}/${v.wanted}` : '—'}</span>
      {v.built && v.pending ? <span className="ml-1 tabular-nums">· {v.pending} in review</span> : null}
    </Badge>
  )
}

export default function AdminCompanyPatternsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [items, setItems] = useState<Item[] | null>(null)
  const [settings, setSettings] = useState<CompanyTestSettings | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ form: PatternForm; isNew: boolean } | null>(null)
  const [formError, setFormError] = useState('')
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [aiBuild, setAiBuild] = useState<Item | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/company-patterns', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setItems(d.items || [])
      setSettings(d.settings)
      setUsage(d.usage)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])
  if (!gate.ready) return null

  const saveSettings = async (patch: Partial<CompanyTestSettings>) => {
    setBusy('settings')
    try {
      const res = await csrfFetch('/api/admin/company-patterns/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: d.error || 'Couldn’t save settings' }); return }
      setSettings(d.settings)
      addToast({ type: 'success', title: 'Settings saved' })
    } finally { setBusy(null) }
  }

  const runRefresh = async () => {
    setBusy('refresh')
    try {
      const res = await csrfFetch('/api/admin/company-patterns/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: d.error || 'Refresh failed' }); return }
      const r = d.report || {}
      addToast({ type: 'success', title: `Refreshed ${r.versions ?? 0} versions`, message: `${r.swapped ?? 0} questions swapped, ${r.drafts ?? 0} drafts written${r.aiCapped ? ' (AI cap reached)' : ''}.` })
      await load()
    } finally { setBusy(null) }
  }

  const build = async (p: Item, useAi: boolean) => {
    setBusy(`build:${p.id}`)
    try {
      const res = await csrfFetch(`/api/admin/company-patterns/${p.id}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'all', useAi }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: d.error || 'Build failed' }); return }
      addToast({
        type: 'success',
        title: `Built ${p.examName}`,
        message: useAi ? `${d.generated ?? 0} AI drafts are waiting in question drafts for review${d.aiCapped ? '; the AI cap stopped generation early' : ''}.` : 'Built from approved bank questions only.',
      })
      await load()
    } finally { setBusy(null) }
  }

  const savePattern = async () => {
    if (!editing) return
    setFormError('')
    setBusy('save')
    try {
      const body = fromForm(editing.form)
      const res = editing.isNew
        ? await csrfFetch('/api/admin/company-patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await csrfFetch(`/api/admin/company-patterns/${editing.form.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(d.error || 'Couldn’t save the pattern'); return }
      setEditing(null)
      addToast({ type: 'success', title: 'Pattern saved', message: 'Rebuild its versions if you changed sections.' })
      await load()
    } finally { setBusy(null) }
  }

  const remove = async (p: Item) => {
    setBusy(`del:${p.id}`)
    try {
      const res = await csrfFetch(`/api/admin/company-patterns/${p.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { addToast({ type: 'error', title: d.error || 'Delete failed' }); return }
      addToast({ type: 'success', title: 'Pattern deleted' })
      await load()
    } finally { setBusy(null) }
  }

  const setField = <K extends keyof PatternForm>(k: K, v: PatternForm[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e))
  const setSection = (i: number, patch: Partial<SectionForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, sections: e.form.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) } } : e))

  const unverified = items?.filter((p) => !p.verified).length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company patterns"
        description={<>Company exam patterns and the practice tests built from them. Seeded patterns are unverified until you check them against the company&apos;s own page. AI drafts go to <Link href="/dashboard/admin/sme-review?tab=drafts" className="font-medium text-primary hover:underline">question drafts</Link> before they reach a test.</>}
        icon={<Building2 />}
        actions={<Button className="min-h-11" onClick={() => { setFormError(''); setEditing({ form: emptyForm(), isNew: true }) }}><Plus className="mr-1 h-4 w-4" aria-hidden />New pattern</Button>}
      />

      {items && usage ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Patterns" value={items.length} hint={unverified ? `${unverified} not verified yet` : 'All verified'} icon={<Building2 />} />
          <StatCard label="AI questions today" value={`${usage.today} / ${usage.dailyCap}`} icon={<Sparkles />} />
          <StatCard label="AI spend this month" value={`$${usage.monthCostUsd.toFixed(2)}`} hint={`Cap $${usage.monthlyCapUsd.toFixed(2)} (estimated)`} icon={<Wand2 />} />
        </div>
      ) : null}

      {settings ? (
        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Weekly refresh</h2>
              <p className="text-sm text-muted-foreground">Once a week, swap about {settings.rotatePercent}% of each version&apos;s questions for unused approved ones of the same difficulty. Off by default.</p>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="refresh-on" className="text-sm">Refresh on</Label>
              <Switch id="refresh-on" checked={settings.refreshEnabled} disabled={busy === 'settings'} onCheckedChange={(v) => void saveSettings({ refreshEnabled: v })} />
              <Button variant="outline" className="min-h-11" disabled={busy === 'refresh'} onClick={() => void runRefresh()}>
                {busy === 'refresh' ? <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden />}Run now
              </Button>
            </div>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              void saveSettings({
                rotatePercent: Number(f.get('rotatePercent')),
                aiDailyQuestionCap: Number(f.get('aiDailyQuestionCap')),
                aiMonthlyCostCapUsd: Number(f.get('aiMonthlyCostCapUsd')),
              })
            }}
          >
            <div className="space-y-1"><Label htmlFor="rotatePercent">Rotate per week (%)</Label><Input id="rotatePercent" name="rotatePercent" type="number" min={5} max={80} defaultValue={settings.rotatePercent} /></div>
            <div className="space-y-1"><Label htmlFor="aiDailyQuestionCap">AI questions per day</Label><Input id="aiDailyQuestionCap" name="aiDailyQuestionCap" type="number" min={0} max={2000} defaultValue={settings.aiDailyQuestionCap} /></div>
            <div className="space-y-1"><Label htmlFor="aiMonthlyCostCapUsd">Monthly AI cap (USD)</Label><Input id="aiMonthlyCostCapUsd" name="aiMonthlyCostCapUsd" type="number" min={0} max={1000} step="0.5" defaultValue={settings.aiMonthlyCostCapUsd} /></div>
            <div className="flex items-end"><Button type="submit" variant="outline" className="min-h-11 w-full" disabled={busy === 'settings'}>Save limits</Button></div>
          </form>
        </Panel>
      ) : null}

      {loadError ? (
        <Panel className="p-4"><EmptyState title="Couldn't load company patterns" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} /></Panel>
      ) : items === null ? (
        <SkeletonList count={4} />
      ) : items.length === 0 ? (
        <Panel className="p-4"><EmptyState title="No company patterns yet" description="Add a pattern to describe a company's test: its sections, timing and cut-off." actionLabel="New pattern" onAction={() => setEditing({ form: emptyForm(), isNew: true })} /></Panel>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <Panel key={p.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{p.examName}</h3>
                    <span className="text-sm text-muted-foreground">{p.companyName}</span>
                    {p.verified
                      ? <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400"><CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />Verified{p.lastReviewed ? ` ${p.lastReviewed}` : ''}</Badge>
                      : <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">Not verified</Badge>}
                    {!p.active ? <Badge variant="secondary">Hidden</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{p.id}</span> · {p.sections.length} sections · {p.sections.reduce((n, s) => n + s.questionCount, 0)} questions · {p.sections.reduce((n, s) => n + s.timeMinutes, 0)} min
                    {' '}· negative {p.negativeMarking} · cut-off {p.cutoffPercent}%
                    {p.sourceUrl ? <> · <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">source</a></> : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void build(p, false)}>
                    {busy === `build:${p.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />}Build from bank
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setAiBuild(p)}><Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />Build and fill with AI</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setFormError(''); setEditing({ form: toForm(p), isNew: false }) }} aria-label={`Edit ${p.examName}`}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDeleting(p)} aria-label={`Delete ${p.examName}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">{p.versions.map((v) => <LevelChip key={v.level} v={v} />)}</div>
              <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {p.sections.map((s) => <li key={s.id} className="rounded-lg bg-muted px-2 py-1">{s.name} · <span className="tabular-nums">{s.questionCount}q/{s.timeMinutes}m</span> · {s.questionTypes.join(', ')}{s.categories.length ? ` · ${s.categories.join(', ')}` : ''}</li>)}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? 'New company pattern' : 'Edit company pattern'}</DialogTitle>
            <DialogDescription>Describe the company&apos;s test as it is publicly documented. Mark it verified only after checking the source.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void savePattern() }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="f-companyName">Company name</Label><Input id="f-companyName" required value={editing.form.companyName} onChange={(e) => setField('companyName', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-companySlug">Company page slug</Label><Input id="f-companySlug" required placeholder="tcs" value={editing.form.companySlug} onChange={(e) => setField('companySlug', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-examName">Exam name</Label><Input id="f-examName" required value={editing.form.examName} onChange={(e) => setField('examName', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-id">Pattern id</Label><Input id="f-id" disabled={!editing.isNew} placeholder="Made from the company and exam" value={editing.form.id} onChange={(e) => setField('id', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-neg">Negative marking (share of a mark, 0–1)</Label><Input id="f-neg" type="number" min={0} max={1} step="0.05" value={editing.form.negativeMarking} onChange={(e) => setField('negativeMarking', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-cut">Overall cut-off (%)</Label><Input id="f-cut" type="number" min={0} max={100} value={editing.form.cutoffPercent} onChange={(e) => setField('cutoffPercent', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-src">Source link</Label><Input id="f-src" type="url" placeholder="https://" value={editing.form.sourceUrl} onChange={(e) => setField('sourceUrl', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="f-rev">Last reviewed</Label><Input id="f-rev" type="date" value={editing.form.lastReviewed} onChange={(e) => setField('lastReviewed', e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor="f-notes">Notes</Label><Textarea id="f-notes" rows={3} value={editing.form.notes} onChange={(e) => setField('notes', e.target.value)} /></div>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2"><Switch id="f-verified" checked={editing.form.verified} onCheckedChange={(v) => setField('verified', v)} /><Label htmlFor="f-verified">Verified against the source</Label></div>
                <div className="flex items-center gap-2"><Switch id="f-active" checked={editing.form.active} onCheckedChange={(v) => setField('active', v)} /><Label htmlFor="f-active">Show to learners</Label></div>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">Sections</legend>
                {editing.form.sections.map((s, i) => (
                  <div key={i} className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-6">
                    <div className="space-y-1 sm:col-span-2"><Label htmlFor={`s-name-${i}`}>Name</Label><Input id={`s-name-${i}`} required value={s.name} onChange={(e) => setSection(i, { name: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`s-count-${i}`}>Questions</Label><Input id={`s-count-${i}`} type="number" min={1} max={100} required value={s.questionCount} onChange={(e) => setSection(i, { questionCount: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`s-min-${i}`}>Minutes</Label><Input id={`s-min-${i}`} type="number" min={1} max={300} required value={s.timeMinutes} onChange={(e) => setSection(i, { timeMinutes: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor={`s-cut-${i}`}>Cut-off %</Label><Input id={`s-cut-${i}`} type="number" min={0} max={100} placeholder="Overall" value={s.cutoffPercent} onChange={(e) => setSection(i, { cutoffPercent: e.target.value })} /></div>
                    <div className="flex items-end justify-end"><Button type="button" size="sm" variant="ghost" disabled={editing.form.sections.length === 1} onClick={() => setEditing((e) => (e ? { ...e, form: { ...e.form, sections: e.form.sections.filter((_, j) => j !== i) } } : e))} aria-label={`Remove section ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /></Button></div>
                    <div className="space-y-1 sm:col-span-3"><Label htmlFor={`s-types-${i}`}>Question types (comma separated)</Label><Input id={`s-types-${i}`} required placeholder="mcq, numeric" value={s.questionTypes} onChange={(e) => setSection(i, { questionTypes: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-3"><Label htmlFor={`s-cats-${i}`}>Categories (comma separated)</Label><Input id={`s-cats-${i}`} placeholder="quant, logical, verbal, coding" value={s.categories} onChange={(e) => setSection(i, { categories: e.target.value })} /></div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" disabled={editing.form.sections.length >= 8} onClick={() => setEditing((e) => (e ? { ...e, form: { ...e.form, sections: [...e.form.sections, emptySection()] } } : e))}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden />Add section</Button>
              </fieldset>

              {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy === 'save'}>{busy === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}Save pattern</Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!aiBuild}
        title="Build and fill with AI?"
        message={`Rebuilds all three levels of ${aiBuild?.examName ?? ''} from the bank, then asks the AI to write the missing questions as drafts (up to ${usage?.remaining ?? 0} more today). Each level stays incomplete until the drafts are approved.`}
        confirmLabel="Build"
        variant="default"
        onConfirm={() => { const p = aiBuild; setAiBuild(null); if (p) void build(p, true) }}
        onCancel={() => setAiBuild(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete this pattern?"
        message={`${deleting?.examName ?? ''} and its built versions will be removed. Bank questions stay in the bank. Practice runs already taken keep their results.`}
        confirmLabel="Delete"
        onConfirm={() => { const p = deleting; setDeleting(null); if (p) void remove(p) }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
