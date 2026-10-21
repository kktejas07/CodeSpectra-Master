'use client'

/** Drive list + create. Detail (applicants, offers) is /dashboard/placement/drives/[id]. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, Plus, Users } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import type { DriveDoc } from '@/lib/campus/types'
import { Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useConsole } from './console-context'
import { DriveForm } from './drive-form'
import { StatusPill, ctcRange, errorOf, fmtDate } from './shared'

export function PlacementDrives() {
  const { url, college, role } = useConsole()
  const addToast = useToast()
  const router = useRouter()
  const [items, setItems] = useState<Array<DriveDoc & { applicants: number }> | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    fetch(url('/api/campus/drives'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setItems(d.items || []) })
      .catch(() => { if (live) { setItems([]); addToast({ type: 'error', title: "Couldn't load drives" }) } })
    return () => { live = false }
  }, [url, addToast])

  const detailHref = (id: string) => `/dashboard/placement/drives/${id}${role === 'superadmin' ? `?college=${encodeURIComponent(college.tenant_id)}` : ''}`

  return (
    <div className="space-y-6">
      <Section
        title="Placement drives"
        actions={!creating ? <Button onClick={() => setCreating(true)} className="min-h-11"><Plus className="mr-2 h-4 w-4" aria-hidden />New drive</Button> : undefined}
      >
        {creating && (
          <Panel>
            <h3 className="mb-4 text-base font-semibold text-foreground">New drive</h3>
            <DriveForm
              busy={busy} submitLabel="Save as draft"
              onSubmit={async (body) => {
                setBusy(true)
                try {
                  const r = await csrfFetch(url('/api/campus/drives'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                  if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
                  const d = await r.json()
                  addToast({ type: 'success', title: 'Drive saved as a draft — open it to students when ready' })
                  router.push(detailHref(d.drive.id))
                } finally { setBusy(false) }
              }}
            />
            <Button variant="ghost" className="mt-2" onClick={() => setCreating(false)}>Cancel</Button>
          </Panel>
        )}
        {items === null ? <SkeletonList count={4} /> : items.length === 0 && !creating ? (
          <EmptyState compact illustration="jobs" title="No drives yet" description="Create a drive for a visiting company, set who's eligible and open it — eligible students are notified." actionLabel="New drive" onAction={() => setCreating(true)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((d) => (
              <Link key={d.id} href={detailHref(d.id)} className="group rounded-3xl border border-border/70 bg-card p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">{d.company.name}</p>
                    <h3 className="font-semibold text-foreground">{d.title}</h3>
                    <p className="text-sm text-muted-foreground">{d.role_title}</p>
                  </div>
                  <StatusPill status={d.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden />Apply by {fmtDate(d.schedule.apply_by)}</span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums"><Users className="h-4 w-4" aria-hidden />{d.applicants} applied</span>
                  {ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency) && <span className="tabular-nums">{ctcRange(d.ctc_minor_min, d.ctc_minor_max, d.currency)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
