'use client'

/**
 * Seller → Analytics: product page views → carts → checkouts → paid orders,
 * sales KPIs with previous-period change, and per-product conversion.
 * GET /api/marketplace/seller/analytics (own products only).
 */
import { useEffect, useMemo, useState } from 'react'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { DEFAULT_RANGE, FunnelView, KpiGrid, RangePicker, formatValue, rangeQuery, type FunnelData, type KpiItem, type RangeValue } from '@/components/analytics/kit'
import { api, money, withAs } from './shared'
import { useT } from '@/lib/i18n/client'

interface Resp {
  kpis: KpiItem[]
  funnel: FunnelData
  products: { id: string; title: string; views: number; orders: number; units: number; revenue: Record<string, number>; conversion: number | null }[]
}

export function SellerSalesAnalytics({ asPlatform }: { asPlatform: boolean }) {
  const { t } = useT()
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE)
  const q = useMemo(() => rangeQuery(range), [range])
  const [data, setData] = useState<Resp | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setErr(null)
    api<Resp>(withAs(`/api/marketplace/seller/analytics?${q}`, asPlatform))
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setErr((e as Error).message) })
    return () => { alive = false }
  }, [q, asPlatform])

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5"><RangePicker value={range} onChange={setRange} /></Panel>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {!data && !err && <div className="h-40 animate-pulse rounded-3xl bg-muted/40 motion-reduce:animate-none" aria-label={t('market.loading')} />}
      {data && (
        <>
          <KpiGrid items={data.kpis} compare={range.compare} />
          <FunnelView funnel={data.funnel} />
          {data.products.length === 0 ? (
            <EmptyState illustration="launch" title={t('market.noProductsYet')} description={t('market.onceYourProductsAreLiveTheir3e6')} />
          ) : (
            <Panel className="overflow-x-auto">
              <h3 className="mb-3 text-base font-semibold text-foreground">{t('market.products')}</h3>
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">{t('market.viewsOrdersAndConversionPerProduct')}</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('market.product')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('market.views')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('market.orders')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('market.items')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('market.sales')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('market.viewsToOrders')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <th scope="row" className="max-w-[16rem] truncate py-1.5 pr-3 text-left font-normal" title={p.title}>{p.title}</th>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(p.views)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(p.orders)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(p.units)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{Object.entries(p.revenue).map(([c, v]) => money(v, c)).join(' · ') || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatValue(p.conversion, 'percent')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">{t('market.viewsCountVisitsToTheProduct33b')}</p>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
