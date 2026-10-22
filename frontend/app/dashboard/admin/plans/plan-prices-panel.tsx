'use client'

/**
 * Per-currency learner prices (INR / USD, monthly / yearly) for each paid plan.
 * Saved as `prices_minor` (integer paise / cents) on the plan; checkout and the
 * pricing pages read the same values (lib/billing/plan-prices.ts).
 */
import { useEffect, useState } from 'react'
import { Loader2, IndianRupee } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { useApiError } from '@/lib/i18n/use-api-error'

type Prices = Partial<Record<'INR' | 'USD', { month?: number | null; year?: number | null }>>
interface PlanRow { plan: string; name: string; description?: string; contactSales?: boolean; prices_minor?: Prices }

const CELLS = [['INR', 'month'], ['INR', 'year'], ['USD', 'month'], ['USD', 'year']] as const
const LABEL = { 'INR.month': 'planPrices.inrMonth', 'INR.year': 'planPrices.inrYear', 'USD.month': 'planPrices.usdMonth', 'USD.year': 'planPrices.usdYear' } as const

export function PlanPricesPanel() {
  const { t } = useAdminT()
  const apiError = useApiError()
  const addToast = useToast()
  const [plans, setPlans] = useState<PlanRow[] | null>(null)
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/plans', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const rows: PlanRow[] = (Array.isArray(j.plans) ? j.plans : []).filter((p: PlanRow) => p.plan !== 'free' && !p.contactSales && p.plan !== 'enterprise')
        setPlans(rows)
        setDraft(Object.fromEntries(rows.map((p) => [p.plan, Object.fromEntries(CELLS.map(([c, i]) => [`${c}.${i}`, p.prices_minor?.[c]?.[i] ? String((p.prices_minor[c]![i] as number) / 100) : '']))])))
      })
      .catch(() => setPlans([]))
  }, [])

  const save = async (p: PlanRow) => {
    setSaving(p.plan)
    try {
      const d = draft[p.plan] || {}
      const toMinor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100))
      const prices_minor: Prices = {
        INR: { month: toMinor(d['INR.month'] || ''), year: toMinor(d['INR.year'] || '') },
        USD: { month: toMinor(d['USD.month'] || ''), year: toMinor(d['USD.year'] || '') },
      }
      const res = await csrfFetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: p.plan, name: p.name, description: p.description ?? '', prices_minor }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(j, t('planPrices.saveFailed')))
      addToast({ type: 'success', title: t('planPrices.saved', { plan: p.name }) })
    } catch (e) {
      addToast({ type: 'error', title: t('planPrices.saveFailed'), message: e instanceof Error ? e.message : '' })
    } finally {
      setSaving(null)
    }
  }

  if (!plans || plans.length === 0) return null

  return (
    <Panel className="space-y-4 p-6">
      <div className="flex items-start gap-2">
        <IndianRupee className="mt-1 h-5 w-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('planPrices.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('planPrices.body')}</p>
        </div>
      </div>
      {plans.map((p) => (
        <div key={p.plan} className="space-y-3 rounded-2xl border border-border p-4">
          <p className="font-medium text-foreground">{p.name}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {CELLS.map(([c, i]) => {
              const id = `pp-${p.plan}-${c}-${i}`
              return (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id}>{t(LABEL[`${c}.${i}`])}</Label>
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={draft[p.plan]?.[`${c}.${i}`] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [p.plan]: { ...d[p.plan], [`${c}.${i}`]: e.target.value } }))}
                    className="tabular-nums"
                  />
                </div>
              )
            })}
          </div>
          <Button size="sm" onClick={() => void save(p)} disabled={saving === p.plan} className="gap-2">
            {saving === p.plan ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('common.save')}
          </Button>
        </div>
      ))}
    </Panel>
  )
}
