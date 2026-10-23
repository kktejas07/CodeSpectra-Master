'use client'

/**
 * Admin → Automations: nudge limits (shared frequency cap + tunables), the
 * nudge run log, and the content-freshness editor queue (W15).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel, Section } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAdminT, type AdminKey } from '@/lib/i18n/admin'

interface LogRow { automation_id: string; ref: string; outcome: string; channels: string[]; reason: string | null; at: string }
interface FreshItem { kind: 'learn' | 'question'; ref_id: string; title: string; reasons: string[]; ai_note?: string; ai_note_source?: 'ai' | 'template'; detected_at: string }
interface Data {
  settings: Record<string, number>
  log: { rows: LogRow[]; week: Record<string, Record<string, number>> }
  freshness: { items: FreshItem[]; open: number }
}

const FIELDS: { key: string; label: AdminKey; help: AdminKey }[] = [
  { key: 'cap_daily', label: 'automations.nudges.capDaily', help: 'automations.nudges.capDailyHelp' },
  { key: 'cap_weekly', label: 'automations.nudges.capWeekly', help: 'automations.nudges.capWeeklyHelp' },
  { key: 'checkout_coupon_pct', label: 'automations.nudges.couponPct', help: 'automations.nudges.couponPctHelp' },
  { key: 'offer_expiry_days', label: 'automations.nudges.offerDays', help: 'automations.nudges.offerDaysHelp' },
  { key: 'bgv_sla_days', label: 'automations.nudges.bgvDays', help: 'automations.nudges.bgvDaysHelp' },
  { key: 'freshness_ai_daily', label: 'automations.nudges.aiDaily', help: 'automations.nudges.aiDailyHelp' },
  { key: 'freshness_ai_monthly_usd', label: 'automations.nudges.aiMonthly', help: 'automations.nudges.aiMonthlyHelp' },
]

const OUTCOMES = ['sent', 'capped', 'stopped', 'skipped', 'failed'] as const

export function AutomationNudges({ automations }: { automations: { id: string; title: string }[] }) {
  const { t, fmt } = useAdminT()
  const [data, setData] = useState<Data | null>(null)
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const title = (id: string) => automations.find((a) => a.id === id)?.title || id

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/automations/nudges${filter ? `?automation=${encodeURIComponent(filter)}` : ''}`, { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error || t('automations.nudges.loadFailed'))
    setData(json as Data)
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String((json as Data).settings[f.key] ?? '')])))
  }, [filter, t])

  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>, key: string, ok: string) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const res = await csrfFetch('/api/admin/automations/nudges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t('automations.nudges.saveFailed'))
      setNotice(ok)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Section title={t('automations.nudges.title')}>
        <Panel className="space-y-4 p-4" data-testid="nudge-limits">
          <p className="text-sm text-muted-foreground">{t('automations.nudges.intro')}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && !error && <p role="status" className="text-sm text-foreground">{notice}</p>}
          {!data ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-label={t('automations.nudges.loading')} /> : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label htmlFor={`nudge-${f.key}`} className="text-xs font-medium text-muted-foreground">{t(f.label)}</label>
                    <Input id={`nudge-${f.key}`} inputMode="decimal" value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{t(f.help)}</p>
                  </div>
                ))}
              </div>
              <Button disabled={!!busy} onClick={() => post({ action: 'settings', settings: Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])])) }, 'settings', t('automations.nudges.saved'))}>
                {busy === 'settings' && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />} {t('automations.nudges.save')}
              </Button>
            </>
          )}
        </Panel>
      </Section>

      <Section title={t('automations.nudges.logTitle')}>
        <Panel className="space-y-3 p-4" data-testid="nudge-log">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="nudge-filter" className="text-xs font-medium text-muted-foreground">{t('automations.nudges.filter')}</label>
            <select id="nudge-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              <option value="">{t('automations.nudges.all')}</option>
              {automations.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>
          {data && Object.keys(data.log.week).length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {Object.entries(data.log.week).map(([id, counts]) => (
                <li key={id} className="rounded-md border border-border/60 px-2 py-1 text-muted-foreground">
                  <span className="font-medium text-foreground">{title(id)}</span>{' '}
                  {OUTCOMES.filter((o) => counts[o]).map((o) => `${t(`automations.nudges.outcome.${o}` as AdminKey)} ${fmt.number(counts[o])}`).join(' · ')}
                </li>
              ))}
            </ul>
          )}
          {!data ? null : !data.log.rows.length ? (
            <EmptyState compact title={t('automations.nudges.logEmpty')} description={t('automations.nudges.logEmptyHelp')} />
          ) : (
            <ul className="divide-y divide-border/60 text-xs">
              {data.log.rows.map((r, i) => (
                <li key={`${r.ref}-${i}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <Badge variant={r.outcome === 'failed' ? 'destructive' : 'outline'} className="self-start sm:w-24 sm:justify-center">{t(`automations.nudges.outcome.${r.outcome}` as AdminKey)}</Badge>
                  <span className="min-w-0 flex-1 text-foreground">{title(r.automation_id)}<span className="block font-mono text-muted-foreground">{r.ref}{r.reason ? ` · ${r.reason}` : ''}{r.channels.length ? ` · ${r.channels.join(', ')}` : ''}</span></span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmt.dateTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>

      <Section title={t('automations.nudges.freshTitle', { count: data?.freshness.open ?? 0 })}>
        <Panel className="space-y-3 p-4" data-testid="freshness-queue">
          {!data ? null : !data.freshness.items.length ? (
            <EmptyState compact title={t('automations.nudges.freshEmpty')} description={t('automations.nudges.freshEmptyHelp')} />
          ) : (
            <ul className="divide-y divide-border/60">
              {data.freshness.items.map((it) => (
                <li key={`${it.kind}:${it.ref_id}`} className="space-y-2 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{it.title || it.ref_id}</p>
                      <p className="text-xs text-muted-foreground">{t(it.kind === 'learn' ? 'automations.nudges.kindLearn' : 'automations.nudges.kindQuestion')} · {it.reasons.join(', ')}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline"><Link href={it.kind === 'learn' ? '/dashboard/admin/learn' : '/dashboard/admin/question-bank'}>{t('automations.nudges.edit')}</Link></Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => post({ action: 'freshness', kind: it.kind, ref_id: it.ref_id, status: 'done' }, `f:${it.ref_id}`, t('automations.nudges.markedDone'))}>{t('automations.nudges.done')}</Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => post({ action: 'freshness', kind: it.kind, ref_id: it.ref_id, status: 'dismissed' }, `d:${it.ref_id}`, t('automations.nudges.dismissedMsg'))}>{t('automations.nudges.dismiss')}</Button>
                    </div>
                  </div>
                  {it.ai_note && (
                    <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-foreground">
                      <p className="mb-1 font-medium text-muted-foreground">{t(it.ai_note_source === 'ai' ? 'automations.nudges.noteAi' : 'automations.nudges.noteTemplate')}</p>
                      <p className="whitespace-pre-line">{it.ai_note}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>
    </>
  )
}
