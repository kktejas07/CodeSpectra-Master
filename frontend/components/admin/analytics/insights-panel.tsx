'use client'

/**
 * Admin → Analytics → Insights (superadmin): platform KPIs, acquisition,
 * content, product usage, funnels, retention cohorts, revenue, AI usage &
 * cost and Web Vitals by page, all over one date range with compare-to-
 * previous and CSV export. Data: GET /api/admin/analytics/insights.
 */
import { useEffect, useMemo, useState } from 'react'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DEFAULT_RANGE, FunnelView, KpiGrid, RangePicker, RankTable, SeriesChart, formatValue, rangeQuery, type FunnelData, type KpiItem, type RangeValue } from '@/components/analytics/kit'
import { BarList } from '@/components/hiring/ui'

const SUBTABS: [string, string][] = [
  ['overview', 'Overview'], ['acquisition', 'Traffic & acquisition'], ['content', 'Content'], ['usage', 'Product usage'],
  ['funnels', 'Funnels'], ['retention', 'Retention'], ['revenue', 'Revenue'], ['ai', 'AI usage & cost'], ['vitals', 'Web Vitals'],
]
const SECTION_OF: Record<string, string[]> = {
  overview: ['kpis', 'traffic'], acquisition: ['traffic'], content: ['content'], usage: ['usage'], funnels: ['funnels'],
  retention: ['retention'], revenue: ['revenue'], ai: ['ai'], vitals: ['vitals'],
}

type Data = Record<string, any>

function useSections(sections: string[], q: string) {
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = sections.join(',') + '|' + q
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all(sections.map((s) => fetch(`/api/admin/analytics/insights?section=${s}&${q}`, { credentials: 'include' }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load analytics')
      return [s, (await r.json()).data] as const
    })))
      .then((entries) => { if (alive) setData(Object.fromEntries(entries)) })
      .catch((e) => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { data, loading, error }
}

export function InsightsPanel() {
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE)
  const q = useMemo(() => rangeQuery(range), [range])
  const { data, loading, error } = useSections(SECTION_OF[tab], q)
  const csv = `/api/admin/analytics/insights?section=${SECTION_OF[tab][SECTION_OF[tab].length - 1]}&${q}&format=csv`

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5">
        <RangePicker value={range} onChange={setRange} csvHref={csv} />
      </Panel>
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {SUBTABS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
          </TabsList>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading && !Object.keys(data).length && <div className="h-48 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" aria-label="Loading" />}
        <TabsContent value="overview" className="space-y-5">{data.kpis && <Overview kpis={data.kpis} traffic={data.traffic} compare={range.compare} />}</TabsContent>
        <TabsContent value="acquisition" className="space-y-5">{data.traffic && <Acquisition t={data.traffic} compare={range.compare} />}</TabsContent>
        <TabsContent value="content" className="space-y-5">{data.content && <Content c={data.content} />}</TabsContent>
        <TabsContent value="usage" className="space-y-5">{data.usage && <Usage u={data.usage} />}</TabsContent>
        <TabsContent value="funnels" className="space-y-5">{data.funnels && <div className="grid gap-4 lg:grid-cols-2">{(data.funnels as FunnelData[]).map((f) => <FunnelView key={f.name} funnel={f} />)}</div>}</TabsContent>
        <TabsContent value="retention" className="space-y-5">{data.retention && <Retention r={data.retention} />}</TabsContent>
        <TabsContent value="revenue" className="space-y-5">{data.revenue && <Revenue r={data.revenue} />}</TabsContent>
        <TabsContent value="ai" className="space-y-5">{data.ai && <Ai a={data.ai} />}</TabsContent>
        <TabsContent value="vitals" className="space-y-5">{data.vitals && <Vitals v={data.vitals} />}</TabsContent>
      </Tabs>
    </div>
  )
}

function Overview({ kpis, traffic, compare }: { kpis: KpiItem[]; traffic?: Data; compare: boolean }) {
  return (
    <>
      <KpiGrid items={kpis} compare={compare} />
      {traffic && (
        <Panel>
          <h3 className="mb-3 text-base font-semibold text-foreground">Visitors per day</h3>
          {traffic.pageviews === 0 ? <EmptyState illustration="analytics" title="No visits recorded yet" description="Page views show up here a few minutes after people visit the site." /> : (
            <SeriesChart data={traffic.series} xKey="day" yKey="visitors" label="Visitors" previous={compare ? traffic.previous_series : null} />
          )}
        </Panel>
      )}
    </>
  )
}

function Acquisition({ t, compare }: { t: Data; compare: boolean }) {
  const items: KpiItem[] = [
    { key: 'pv', label: 'Page views', value: t.pageviews, previous: t.previous?.pageviews, change: pctChange(t.pageviews, t.previous?.pageviews) },
    { key: 'v', label: 'Visitors', value: t.visitors, previous: t.previous?.visitors, change: pctChange(t.visitors, t.previous?.visitors), hint: 'Daily unique, summed' },
    { key: 's', label: 'Sessions', value: t.sessions, previous: t.previous?.sessions, change: pctChange(t.sessions, t.previous?.sessions) },
    { key: 'b', label: 'Bounce rate', value: t.bounce_rate, unit: 'percent', previous: t.previous?.bounce_rate, change: pctChange(t.bounce_rate, t.previous?.bounce_rate), hint: 'Sessions with one page' },
  ]
  return (
    <>
      <KpiGrid items={items} compare={compare} />
      <Panel><h3 className="mb-3 text-base font-semibold text-foreground">Page views per day</h3><SeriesChart data={t.series} xKey="day" yKey="pageviews" label="Page views" previous={compare ? t.previous_series : null} /></Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <RankTable title="Sources" rows={t.sources} valueLabel="Sessions" />
        <RankTable title="UTM campaigns" rows={t.campaigns} valueLabel="Sessions" empty="No tagged campaign links in this period." />
        <RankTable title="Landing pages" rows={t.landings} valueLabel="Sessions" />
        <RankTable title="Countries" rows={t.countries} valueLabel="Sessions" />
        <RankTable title="Devices" rows={t.devices} valueLabel="Sessions" />
        <RankTable title="Browsers" rows={t.browsers} valueLabel="Sessions" />
        <RankTable title="Custom events" rows={t.events} />
        <RankTable title="Private pages (counts only)" rows={t.private_pages} empty="No visits to token links, tests or payment steps." />
      </div>
    </>
  )
}

function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

function Content({ c }: { c: Data }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel className="p-5"><p className="text-sm text-muted-foreground">New event subscribers</p><p className="text-2xl font-bold tabular-nums">{formatValue(c.events.new_subscribers)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Active subscribers</p><p className="text-2xl font-bold tabular-nums">{formatValue(c.events.active_subscribers)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Event reminders saved</p><p className="text-2xl font-bold tabular-nums">{formatValue(c.events.saved_reminders)}</p></Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RankTable title="Top pages" rows={c.top_pages} valueLabel="Views" />
        <RankTable title="Learn posts — views in this period" rows={c.learn.views_in_range.map((p: Data) => ({ key: p.title, count: p.views, extra: `${p.shares_all_time} shares all time` }))} valueLabel="Views" empty="No Learn post views in this period." />
        <RankTable title="Learn posts — all time" rows={c.learn.top_all_time.map((p: Data) => ({ key: p.title, count: p.views, extra: `${p.shares} shares` }))} valueLabel="Views" empty="No published posts yet." />
        <RankTable title="Events — views in this period" rows={c.events.views_in_range.map((e: Data) => ({ key: e.title, count: e.views }))} valueLabel="Views" empty="No event page views in this period." />
      </div>
    </>
  )
}

function Usage({ u }: { u: Data }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Daily active</p><p className="text-2xl font-bold tabular-nums">{formatValue(u.dau)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Weekly active</p><p className="text-2xl font-bold tabular-nums">{formatValue(u.wau)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Monthly active</p><p className="text-2xl font-bold tabular-nums">{formatValue(u.mau)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">DAU / MAU</p><p className="text-2xl font-bold tabular-nums">{formatValue(u.stickiness, 'percent')}</p></Panel>
      </div>
      <Panel><h3 className="mb-3 text-base font-semibold text-foreground">Active users per day</h3><SeriesChart data={u.series} xKey="day" yKey="users" label="Active users" /></Panel>
      {u.adoption?.length > 0 && (
        <Panel>
          <h3 className="mb-3 text-base font-semibold text-foreground">Feature adoption (people who used it in this period)</h3>
          <BarList caption="Feature adoption" rows={u.adoption.map((a: Data) => ({ label: a.feature, value: a.users }))} />
        </Panel>
      )}
      <p className="text-xs text-muted-foreground">{u.note}</p>
    </>
  )
}

function Retention({ r }: { r: Data }) {
  if (!r.cohorts.length) return <EmptyState illustration="analytics" title="No cohorts yet" description="Weekly cohorts appear once people sign up and come back." />
  return (
    <Panel className="overflow-x-auto">
      <h3 className="mb-3 text-base font-semibold text-foreground">Weekly retention by sign-up week</h3>
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Share of each sign-up cohort active in each following week</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Week of</th>
            <th scope="col" className="py-2 pr-3 font-medium">People</th>
            {Array.from({ length: r.weeks }, (_, i) => <th key={i} scope="col" className="px-1 py-2 text-center font-medium">W{i}</th>)}
          </tr>
        </thead>
        <tbody>
          {r.cohorts.map((c: Data) => (
            <tr key={c.cohort} className="border-t border-border/60">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal tabular-nums">{c.cohort}</th>
              <td className="py-1.5 pr-3 tabular-nums">{c.size}</td>
              {c.weeks.map((w: number | null, i: number) => (
                <td key={i} className="px-1 py-1.5 text-center tabular-nums">
                  {w === null ? <span className="text-muted-foreground">·</span> : (
                    <span className="inline-block min-w-12 rounded-md px-1.5 py-0.5 text-foreground" style={{ backgroundColor: `hsl(var(--primary) / ${Math.min(0.75, 0.08 + w / 130)})` }}>{w}%</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function Revenue({ r }: { r: Data }) {
  const mkt = r.marketplace
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Plan revenue</p><p className="text-2xl font-bold tabular-nums">{formatValue(r.plan_revenue, 'money', r.currency)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Paid orders</p><p className="text-2xl font-bold tabular-nums">{formatValue(r.orders)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Refunds</p><p className="text-2xl font-bold tabular-nums">{formatValue(r.refunds)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Subscriptions ended</p><p className="text-2xl font-bold tabular-nums">{formatValue(r.subscriptions_ended)}</p></Panel>
      </div>
      <Panel><h3 className="mb-3 text-base font-semibold text-foreground">Plan revenue per day</h3><SeriesChart data={r.series} xKey="day" yKey="revenue" label="Revenue" /></Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <RankTable title="Revenue by plan" rows={r.by_plan.map((p: Data) => ({ key: p.plan, count: p.revenue }))} valueLabel="Revenue" />
        {mkt && (
          <Panel className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Marketplace</h3>
            {(mkt.totals?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No marketplace sales in this period.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th scope="col" className="py-1 font-medium">Currency</th><th scope="col" className="py-1 text-right font-medium">GMV</th><th scope="col" className="py-1 text-right font-medium">Commission</th><th scope="col" className="py-1 text-right font-medium">Refunds</th><th scope="col" className="py-1 text-right font-medium">Orders</th></tr></thead>
                <tbody>
                  {mkt.totals.map((g: Data) => (
                    <tr key={g.currency} className="border-t border-border/60">
                      <th scope="row" className="py-1.5 text-left font-normal">{g.currency}</th>
                      <td className="py-1.5 text-right tabular-nums">{formatValue((g.gmv ?? 0) / 100, 'money', g.currency)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatValue((g.commission ?? 0) / 100, 'money', g.currency)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatValue((g.refunds ?? 0) / 100, 'money', g.currency)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatValue(g.orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}

function Ai({ a }: { a: Data }) {
  const rows = (list: Data[]) => list.map((r) => ({ key: r.key, count: r.requests, extra: `${formatValue(r.tokens)} tokens · $${r.cost_usd}` }))
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel className="p-5"><p className="text-sm text-muted-foreground">AI requests</p><p className="text-2xl font-bold tabular-nums">{formatValue(a.totals.requests)}</p><p className="text-xs text-muted-foreground">{formatValue(a.totals.failed)} failed</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Tokens</p><p className="text-2xl font-bold tabular-nums">{formatValue(a.totals.prompt_tokens + a.totals.completion_tokens)}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Estimated cost</p><p className="text-2xl font-bold tabular-nums">${a.totals.cost_usd}</p></Panel>
        <Panel className="p-5"><p className="text-sm text-muted-foreground">Copilot questions</p><p className="text-2xl font-bold tabular-nums">{formatValue(a.copilot_questions)}</p></Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RankTable title="By feature" rows={rows(a.by_feature)} valueLabel="Requests" />
        <RankTable title="By organisation" rows={rows(a.by_tenant)} valueLabel="Requests" />
        <RankTable title="By model" rows={rows(a.by_model)} valueLabel="Requests" />
      </div>
      <p className="text-xs text-muted-foreground">{a.note}</p>
    </>
  )
}

const VITAL_LIMITS: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], TTFB: [800, 1800] }

function VitalCell({ name, v }: { name: string; v: number | null }) {
  if (v === null || v === undefined) return <td className="px-2 py-1.5 text-right text-muted-foreground">—</td>
  const [good, poor] = VITAL_LIMITS[name]
  const tone = v <= good ? 'text-green-700 dark:text-green-400' : v <= poor ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'
  const label = v <= good ? 'good' : v <= poor ? 'needs work' : 'poor'
  return <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${tone}`}>{name === 'CLS' ? v.toFixed(3) : `${Math.round(v)} ms`}<span className="sr-only"> ({label})</span></td>
}

function Vitals({ v }: { v: Data }) {
  if (!v.pages.length) return <EmptyState illustration="analytics" title="No Web Vitals yet" description="Real-user Core Web Vitals appear once people browse the site." />
  return (
    <Panel className="overflow-x-auto">
      <h3 className="mb-1 text-base font-semibold text-foreground">Web Vitals by page (75th percentile)</h3>
      <p className="mb-3 text-xs text-muted-foreground">Green is good, amber needs work, red is poor (Google thresholds). {formatValue(v.samples)} samples.</p>
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Page</th><th scope="col" className="px-2 py-2 text-right font-medium">Samples</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">LCP</th><th scope="col" className="px-2 py-2 text-right font-medium">INP</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">CLS</th><th scope="col" className="px-2 py-2 text-right font-medium">TTFB</th>
          </tr>
        </thead>
        <tbody>
          {v.pages.map((p: Data) => (
            <tr key={p.route} className="border-t border-border/60">
              <th scope="row" className="max-w-[18rem] truncate py-1.5 pr-3 text-left font-normal" title={p.route}>{p.route}</th>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(p.samples)}</td>
              <VitalCell name="LCP" v={p.LCP} /><VitalCell name="INP" v={p.INP} /><VitalCell name="CLS" v={p.CLS} /><VitalCell name="TTFB" v={p.TTFB} />
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
