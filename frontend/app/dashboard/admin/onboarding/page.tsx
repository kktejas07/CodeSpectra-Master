'use client'

/**
 * /dashboard/admin/onboarding (organisation admins) — the setup checklist from
 * the org onboarding assistant (lib/assistants/onboarding). Each open step
 * links to its page; steps the copilot can draft open the copilot with a
 * prompt, and the draft is a proposal you confirm there. A superadmin picks
 * the organisation first (CORE-047), like Admin → Hiring agents.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BotMessageSquare, CheckCircle2, Circle, EyeOff, ListChecks, RefreshCw } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useAdminT } from '@/lib/i18n/admin'
import type { Checklist } from '@/lib/assistants/onboarding/checklist'

interface View { enabled: boolean; checklist?: Checklist; dismissed?: boolean; org_name?: string }

export default function OnboardingPage() {
  const gate = usePageGuard('/dashboard/admin/onboarding')
  const { t, td } = useAdminT()
  const addToast = useToast()
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Superadmin only: the organisation list (a 403 from the tenants API = "my own organisation").
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }> | null>(null)
  const [tenant, setTenant] = useState('')
  const [tenantsChecked, setTenantsChecked] = useState(false)
  const isSuper = tenants !== null
  const q = isSuper ? `?tenant=${encodeURIComponent(tenant)}` : ''

  useEffect(() => {
    if (!gate.ready) return
    void fetch('/api/admin/agent/tenants', { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()) as { tenants?: Array<{ id: string; name: string }> }).tenants ?? null : null))
      .then((list) => setTenants(list))
      .catch(() => setTenants(null))
      .finally(() => setTenantsChecked(true))
  }, [gate.ready])

  const load = useCallback(async () => {
    setError(null)
    if (isSuper && !tenant) { setView(null); return }
    try {
      const r = await fetch(`/api/assistants/onboarding${q}`, { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error || t('onboarding.loadFailed'))
      setView(d as View)
    } catch (e) { setError((e as Error).message) }
  }, [t, isSuper, tenant, q])
  useEffect(() => { if (gate.ready && tenantsChecked) void load() }, [gate.ready, tenantsChecked, load])

  const setDismissed = async (dismissed: boolean) => {
    try {
      const r = await csrfFetch(`/api/assistants/onboarding${q}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismissed }) })
      if (!r.ok) throw new Error(t('onboarding.saveFailed'))
      setView((v) => (v ? { ...v, dismissed } : v))
      addToast({ type: 'success', title: dismissed ? t('onboarding.hidden') : t('onboarding.shown') })
    } catch (e) { addToast({ type: 'error', title: (e as Error).message }) }
  }

  if (!gate.ready) return null
  const c = view?.checklist
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        title={t('onboarding.title')} icon={<ListChecks />}
        description={view?.org_name ? t('onboarding.descriptionFor', { org: view.org_name }) : t('onboarding.description')}
        actions={<Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />{t('onboarding.refresh')}</Button>}
      />
      {isSuper && (
        <div className="max-w-sm">
          <label htmlFor="onb-tenant" className="text-xs font-medium text-foreground">{t('onboarding.orgLabel')}</label>
          <select id="onb-tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <option value="">{t('onboarding.orgPick')}</option>
            {tenants!.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {isSuper && !tenant ? <EmptyState compact illustration="inbox" title={t('onboarding.orgPick')} description={t('onboarding.orgPickDesc')} />
        : error ? <EmptyState illustration="error" title={t('onboarding.loadFailed')} description={error} actionLabel={t('onboarding.retry')} onAction={() => void load()} />
        : !view ? <div className="h-80 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-busy="true" />
        : !view.enabled || !c ? <EmptyState title={t('onboarding.off')} description={t('onboarding.offDesc')} />
        : (
          <>
            <Panel className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-foreground">{c.complete ? t('onboarding.allDone') : t('onboarding.progress', { done: c.done, total: c.total })}</p>
                <Button variant="ghost" size="sm" onClick={() => void setDismissed(!view.dismissed)}><EyeOff className="mr-1.5 h-4 w-4" aria-hidden />{view.dismissed ? t('onboarding.showReminders') : t('onboarding.hideReminders')}</Button>
              </div>
              <Progress value={c.percent} className="mt-3" aria-label={t('onboarding.progress', { done: c.done, total: c.total })} />
            </Panel>
            <ol className="space-y-3">
              {c.steps.map((s, i) => (
                <li key={s.id}>
                  <Panel className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${s.id === c.next ? 'border-primary/50' : ''}`}>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {s.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                      <div className="min-w-0">
                        <p className="font-medium text-foreground"><span className="sr-only">{s.done ? t('onboarding.done') : t('onboarding.todo')}: </span>{i + 1}. {td(`onboarding.step_${s.id}_${c.kind}`, td(`onboarding.step_${s.id}`, s.id))}</p>
                        <p className="text-sm text-muted-foreground">{td(`onboarding.stepDesc_${s.id}_${c.kind}`, td(`onboarding.stepDesc_${s.id}`, ''))}</p>
                      </div>
                    </div>
                    {!s.done && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button asChild variant={s.id === c.next ? 'default' : 'outline'} size="sm" className="rounded-full"><Link href={s.href}>{t('onboarding.open')}</Link></Button>
                        {s.copilot && (
                          <Button asChild variant="outline" size="sm" className="rounded-full">
                            <Link href={`/dashboard/admin/agent?ask=${encodeURIComponent(td(`onboarding.copilot_${s.id}_${c.kind}`, s.copilot))}`}><BotMessageSquare className="mr-1.5 h-4 w-4" aria-hidden />{t('onboarding.askCopilot')}</Link>
                          </Button>
                        )}
                      </div>
                    )}
                  </Panel>
                </li>
              ))}
            </ol>
          </>
        )}
    </div>
  )
}
