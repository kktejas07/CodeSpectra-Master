'use client'

/**
 * Admin → Settings → SEO & AI search: site URL, default share image, entity
 * facts (social profiles, locations), AI-crawler policy, IndexNow, search
 * engine verification, editorial team, comparison pages — and the SEO health
 * panel (pages missing titles/descriptions/schema, sitemap counts).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, Globe2, Info, KeyRound, Loader2, RefreshCw, Save, Search, XCircle } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { AI_CRAWLERS, DEFAULT_SEO_SETTINGS, slugifyComparison, type ComparisonPage, type SeoSettings } from '@/lib/seo/settings-shared'
import type { HealthReport } from '@/lib/seo/health'

const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
const pipeRows = (v: string) => lines(v).map((l) => l.split('|').map((x) => x.trim()))

function Section({ title, icon, children, description }: { title: string; icon: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-2">{icon}<h2 className="text-base font-semibold">{title}</h2></div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4 p-6">{children}</div>
    </Card>
  )
}

export function SeoSettingsSection() {
  const [s, setS] = useState<SeoSettings>(DEFAULT_SEO_SETTINGS)
  const [resolved, setResolved] = useState('')
  const [indexState, setIndexState] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  // Free-text editors (parsed on save).
  const [social, setSocial] = useState('')
  const [locations, setLocations] = useState('')
  const [team, setTeam] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/seo', { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed to load')
      const v = j.settings as SeoSettings
      setS(v)
      setResolved(j.site_url_resolved || '')
      setIndexState(j.indexnow || null)
      setSocial(v.social_profiles.join('\n'))
      setLocations(v.organization.locations.join('\n'))
      setTeam(v.editorial_team.map((m) => [m.name, m.role, m.url, m.bio].join(' | ')).join('\n'))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed to load' })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const r = await fetch('/api/admin/seo/health', { credentials: 'include' })
      if (r.ok) setHealth(await r.json())
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => { void load(); void loadHealth() }, [load, loadHealth])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    const body: SeoSettings = {
      ...s,
      social_profiles: lines(social),
      organization: { ...s.organization, locations: lines(locations) },
      editorial_team: pipeRows(team).map(([name = '', role = '', url = '', ...bio]) => ({ name, role, url, bio: bio.join(' | ') })),
    }
    try {
      const r = await csrfFetch('/api/admin/seo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: body }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Save failed')
      setS(j.settings)
      setResolved(j.site_url_resolved || '')
      setMsg({ ok: true, text: 'SEO settings saved. robots.txt, sitemaps and page metadata pick them up within a minute.' })
      void loadHealth()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const indexNow = async (action: 'generate' | 'submit') => {
    setMsg(null)
    const r = await csrfFetch('/api/admin/seo/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const j = await r.json().catch(() => ({}))
    if (action === 'generate' && j.key) { setS((p) => ({ ...p, indexnow_key: j.key })); setMsg({ ok: true, text: 'New key generated. Save to publish it at /indexnow-key.txt.' }); return }
    setMsg(r.ok ? { ok: true, text: `Submitted ${j.submitted ?? 0} URL(s) to IndexNow (HTTP ${j.status ?? '—'}).` } : { ok: false, text: j.error || j.reason || `IndexNow returned ${j.status ?? 'an error'}` })
  }

  const setOrg = (patch: Partial<SeoSettings['organization']>) => setS((p) => ({ ...p, organization: { ...p.organization, ...patch } }))
  const setComp = (i: number, patch: Partial<ComparisonPage>) => setS((p) => ({ ...p, comparisons: p.comparisons.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading SEO settings…</div>

  return (
    <div className="space-y-6">
      {msg ? (
        <div role="status" className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${msg.ok ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
          {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{msg.text}
        </div>
      ) : null}

      <HealthPanel report={health} loading={healthLoading} onRefresh={loadHealth} />

      <Section title="Site and entity" icon={<Globe2 className="h-5 w-5 text-primary" />} description="Used for canonical links, sitemaps, Organization schema and the About page facts.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="seo-site">Site URL</Label>
            <Input id="seo-site" placeholder="https://codespectra.ai" value={s.site_url} onChange={(e) => setS({ ...s, site_url: e.target.value })} />
            <p className="text-xs text-muted-foreground">Leave empty to use NEXT_PUBLIC_SITE_URL. In use now: <code>{resolved}</code></p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-og">Default share image URL</Label>
            <Input id="seo-og" placeholder="https://… (1200×630). Empty = generated brand card" value={s.default_og_image} onChange={(e) => setS({ ...s, default_og_image: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-legal">Legal name</Label>
            <Input id="seo-legal" value={s.organization.legal_name} onChange={(e) => setOrg({ legal_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-email">Public contact email</Label>
            <Input id="seo-email" type="email" value={s.organization.email} onChange={(e) => setOrg({ email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-logo">Logo URL (square, ≥112px)</Label>
            <Input id="seo-logo" placeholder="Empty = /logo.png" value={s.organization.logo_url} onChange={(e) => setOrg({ logo_url: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-year">Founding year</Label>
            <Input id="seo-year" inputMode="numeric" placeholder="YYYY" value={s.organization.founding_year} onChange={(e) => setOrg({ founding_year: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-social">Social profiles (one URL per line)</Label>
            <Textarea id="seo-social" rows={4} placeholder={'https://www.linkedin.com/company/…\nhttps://github.com/…'} value={social} onChange={(e) => setSocial(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-loc">Locations (“City, Region, CC” per line)</Label>
            <Textarea id="seo-loc" rows={4} value={locations} onChange={(e) => setLocations(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="AI crawlers" icon={<Bot className="h-5 w-5 text-primary" />} description="Allowed crawlers may read public pages (marketing, Learn, events, jobs, marketplace) so assistants can describe and cite CodeSpectra. Private and app pages are always blocked.">
        <ul className="divide-y divide-border/60">
          {AI_CRAWLERS.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{c.id} <span className="text-muted-foreground">· {c.owner}</span></p>
                <p className="text-xs text-muted-foreground">{c.purpose}</p>
              </div>
              <Switch aria-label={`Allow ${c.id}`} checked={s.ai_crawlers[c.id] !== false} onCheckedChange={(v) => setS({ ...s, ai_crawlers: { ...s.ai_crawlers, [c.id]: v } })} />
            </li>
          ))}
        </ul>
        <a href="/robots.txt" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">View robots.txt <ExternalLink className="h-3 w-3" /></a>
      </Section>

      <Section title="Search engines" icon={<Search className="h-5 w-5 text-primary" />} description="Verification meta tags (or verify by DNS and leave these empty) and IndexNow instant indexing for Bing, Yandex and others.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="v-g">Google verification code</Label><Input id="v-g" value={s.verification.google} onChange={(e) => setS({ ...s, verification: { ...s.verification, google: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label htmlFor="v-b">Bing (msvalidate.01)</Label><Input id="v-b" value={s.verification.bing} onChange={(e) => setS({ ...s, verification: { ...s.verification, bing: e.target.value } })} /></div>
          <div className="space-y-1.5"><Label htmlFor="v-y">Yandex</Label><Input id="v-y" value={s.verification.yandex} onChange={(e) => setS({ ...s, verification: { ...s.verification, yandex: e.target.value } })} /></div>
        </div>
        <div className="rounded-2xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><p className="text-sm font-medium">IndexNow</p></div>
            <Switch aria-label="Enable IndexNow" checked={s.indexnow_enabled} onCheckedChange={(v) => setS({ ...s, indexnow_enabled: v })} />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="IndexNow key" placeholder="8–128 letters, digits or dashes" value={s.indexnow_key} onChange={(e) => setS({ ...s, indexnow_key: e.target.value.trim() })} />
            <Button type="button" variant="outline" onClick={() => indexNow('generate')}>Generate</Button>
            <Button type="button" variant="outline" onClick={() => indexNow('submit')} disabled={!s.indexnow_enabled}>Submit last 7 days</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Served at <code>/indexnow-key.txt</code>. Changed Learn posts, events, jobs, hackathons and marketplace items are submitted every 10 minutes.
            {indexState?.last_run_at ? ` Last run ${String(indexState.last_run_at).slice(0, 16).replace('T', ' ')} UTC, ${String(indexState.last_submitted ?? 0)} URL(s)${indexState.last_error ? `, error: ${String(indexState.last_error)}` : ''}.` : ''}
          </p>
        </div>
      </Section>

      <Section title="Editorial team" icon={<Info className="h-5 w-5 text-primary" />} description="Shown on /editorial-policy as the people accountable for published content. One per line: Name | Role | Profile URL | Short bio. Only real people, with their consent.">
        <Textarea rows={4} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Jane Doe | Learn editor | https://www.linkedin.com/in/… | 10 years building backend systems" />
      </Section>

      <Section title="Comparison pages" icon={<Globe2 className="h-5 w-5 text-primary" />} description="“CodeSpectra vs X” pages at /compare/<slug>. Write only facts you can source; list the competitor pages you used. Unpublished pages return 404.">
        {s.comparisons.map((c, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border/70 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Competitor</Label><Input aria-label="Competitor" value={c.competitor} onChange={(e) => setComp(i, { competitor: e.target.value, slug: c.slug || slugifyComparison(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Slug</Label><Input aria-label="Slug" value={c.slug} onChange={(e) => setComp(i, { slug: slugifyComparison(e.target.value) })} /></div>
              <div className="flex items-end justify-between gap-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={c.published} onCheckedChange={(v) => setComp(i, { published: v, updated_at: new Date().toISOString() })} /> Published</label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setS((p) => ({ ...p, comparisons: p.comparisons.filter((_, j) => j !== i) }))}>Remove</Button>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Short answer (2–3 sentences)</Label><Textarea aria-label="Short answer (2–3 sentences)" rows={2} value={c.summary} onChange={(e) => setComp(i, { summary: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Rows: Feature | CodeSpectra | Competitor (one per line)</Label>
              <Textarea aria-label="Rows: Feature | CodeSpectra | Competitor (one per line)" key={`rows-${i}-${s.comparisons.length}`} rows={4} defaultValue={c.rows.map((r) => `${r.feature} | ${r.codespectra} | ${r.competitor}`).join('\n')} onBlur={(e) => setComp(i, { rows: pipeRows(e.target.value).map(([feature = '', codespectra = '', competitor = '']) => ({ feature, codespectra, competitor })), updated_at: new Date().toISOString() })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Choose CodeSpectra if…</Label><Textarea aria-label="Choose CodeSpectra if…" rows={2} value={c.best_for_codespectra} onChange={(e) => setComp(i, { best_for_codespectra: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Choose {c.competitor || 'them'} if…</Label><Textarea aria-label="Choose if…" rows={2} value={c.best_for_competitor} onChange={(e) => setComp(i, { best_for_competitor: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Sources (one URL per line)</Label><Textarea aria-label="Sources (one URL per line)" key={`src-${i}-${s.comparisons.length}`} rows={2} defaultValue={c.sources.join('\n')} onBlur={(e) => setComp(i, { sources: lines(e.target.value) })} /></div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setS((p) => ({ ...p, comparisons: [...p.comparisons, { slug: '', competitor: '', summary: '', rows: [], best_for_codespectra: '', best_for_competitor: '', sources: [], published: false, updated_at: new Date().toISOString() }] }))}>
          Add comparison
        </Button>
      </Section>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2 shadow-lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save SEO settings
        </Button>
      </div>
    </div>
  )
}

function HealthPanel({ report, loading, onRefresh }: { report: HealthReport | null; loading: boolean; onRefresh: () => void }) {
  const errors = report?.issues.filter((i) => i.severity === 'error') ?? []
  const warnings = report?.issues.filter((i) => i.severity === 'warning') ?? []
  const infos = report?.issues.filter((i) => i.severity === 'info') ?? []
  return (
    <Section title="SEO health" icon={<AlertTriangle className="h-5 w-5 text-primary" />} description="Pages missing titles, descriptions, share images or structured data; content that can't produce rich results; sitemap counts.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {report ? (
          <p className="text-sm">
            Score <span className="text-2xl font-bold tabular-nums">{report.score}</span>/100 · <span className="tabular-nums">{errors.length}</span> errors · <span className="tabular-nums">{warnings.length}</span> warnings · site <code>{report.site_url}</code> ({report.site_url_source})
          </p>
        ) : <p className="text-sm text-muted-foreground">{loading ? 'Checking…' : 'No report yet.'}</p>}
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-check
        </Button>
      </div>
      {report ? (
        <>
          <div>
            <p className="mb-2 text-sm font-medium">Sitemaps</p>
            <ul className="flex flex-wrap gap-2">
              {Object.entries(report.sitemaps).map(([t, n]) => (
                <li key={t}><a href={`/sitemaps/${t}.xml`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:border-primary/50">{t} <span className="font-semibold tabular-nums">{n}</span></a></li>
              ))}
            </ul>
          </div>
          {[...errors, ...warnings, ...infos].length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="py-2 pr-3 font-medium">Severity</th><th className="py-2 pr-3 font-medium">Area</th><th className="py-2 pr-3 font-medium">Item</th><th className="py-2 font-medium">Issue</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {[...errors, ...warnings, ...infos].slice(0, 200).map((i, k) => (
                    <tr key={k}>
                      <td className={`py-2 pr-3 capitalize ${i.severity === 'error' ? 'text-destructive' : i.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{i.severity}</td>
                      <td className="py-2 pr-3">{i.area}</td>
                      <td className="py-2 pr-3">{i.href ? <a className="text-primary hover:underline" href={i.href} target="_blank" rel="noopener">{i.item}</a> : i.item}</td>
                      <td className="py-2">{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No issues found.</p>}
          <details>
            <summary className="cursor-pointer text-sm font-medium">Indexable pages ({report.pages.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {report.pages.map((p) => (
                <li key={p.path} className="flex flex-wrap gap-x-3"><code>{p.path}</code><span>title {p.title_length}</span><span>description {p.description_length}</span><span>{p.schema.join(', ') || 'no extra schema'}</span></li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </Section>
  )
}
