'use client'

/**
 * Placement console (college admin, placement officers, superadmin). Open to
 * any signed-in role in the page map; every /api/campus route checks the
 * caller is on the college's placement team (lib/campus/access).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConsoleContext, scopedUrl, type ConsoleCtx } from '@/components/campus/console-context'
import { PlacementOverview } from '@/components/campus/placement-overview'
import { PlacementStudents } from '@/components/campus/placement-students'
import { PlacementReadiness } from '@/components/campus/placement-readiness'
import { PlacementDrives } from '@/components/campus/placement-drives'
import { PlacementSettings } from '@/components/campus/placement-settings'
import type { CollegeDoc } from '@/lib/campus/types'
import { useT } from '@/lib/i18n/client'

const TABS = ['overview', 'students', 'readiness', 'drives', 'settings'] as const
type Tab = (typeof TABS)[number]

interface CollegeResponse {
  college: CollegeDoc | null
  role: ConsoleCtx['role'] | null
  colleges?: Array<{ tenant_id: string; name: string; slug: string; city: string | null }>
}

export default function PlacementPage() {
  return (
    <Suspense fallback={<div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>}>
      <PlacementInner />
    </Suspense>
  )
}

function PlacementInner() {
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const params = useSearchParams()
  const router = useRouter()
  const collegeParam = params.get('college')
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'overview'
  const [data, setData] = useState<CollegeResponse | null>(null)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    let live = true
    setError(false)
    fetch(scopedUrl('/api/campus/college', collegeParam), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [gate.ready, collegeParam, reload])

  const reloadCollege = useCallback(() => setReload((n) => n + 1), [])
  const ctx = useMemo<ConsoleCtx | null>(() => (data?.college && data.role ? {
    college: data.college, role: data.role, url: (p: string) => scopedUrl(p, data.role === 'superadmin' ? data.college!.tenant_id : null), reloadCollege,
  } : null), [data, reloadCollege])

  const setTab = (t: string) => {
    const q = new URLSearchParams(params.toString())
    q.set('tab', t)
    router.replace(`/dashboard/placement?${q.toString()}`, { scroll: false })
  }

  if (!gate.ready || (!data && !error)) {
    return <div className="w-full space-y-6" aria-busy="true"><SkeletonText lines={2} /><SkeletonList count={4} /></div>
  }
  if (error) return <EmptyState illustration="error" title={tr('career.weCouldntLoadThePlacementConsole')} description={tr('career.checkYourConnectionAndTryAgain')} actionLabel={tr('common.tryAgain')} onAction={reloadCollege} />

  if (data && !data.college) {
    if (data.role === 'superadmin') {
      return (
        <div className="w-full space-y-6">
          <PageHeader icon={<Building2 aria-hidden />} title={tr('career.placementConsole')} description={tr('career.pickACollegeToManage')} />
          {data.colleges?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.colleges.map((c) => (
                <Link key={c.tenant_id} href={`/dashboard/placement?college=${encodeURIComponent(c.tenant_id)}`} className="rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="font-semibold text-foreground">{c.name}</p>
                  <p className="text-sm text-muted-foreground">{c.city || c.slug}</p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState illustration="team" title={tr('career.noCollegesYet')} description={tr('career.anOrganisationAdminSetsTheirOrganisation41a')} />
          )}
        </div>
      )
    }
    return (
      <EmptyState
        illustration="locked"
        title={tr('career.youreNotOnAPlacementTeam')}
        description={tr('career.yourCollegeAdminCanAddYouba4')}
        actionLabel={tr('career.goToCampus')} actionHref="/dashboard/campus"
      />
    )
  }

  return (
    <ConsoleContext.Provider value={ctx}>
      <div className="w-full space-y-6">
        <PageHeader
          icon={<Building2 aria-hidden />}
          title={tr('career.placementConsole')}
          description={tr('career.nameStudentsReadinessAndPlacementDrives', { name: ctx!.college.name })}
          actions={ctx!.role === 'superadmin' ? <Button asChild variant="outline" size="sm"><Link href="/dashboard/placement">{tr('career.switchCollege')}</Link></Button> : undefined}
        />
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList>
              <TabsTrigger value="overview">{tr('career.overview')}</TabsTrigger>
              <TabsTrigger value="students">{tr('career.students')}</TabsTrigger>
              <TabsTrigger value="readiness">{tr('career.readiness')}</TabsTrigger>
              <TabsTrigger value="drives">{tr('career.drives')}</TabsTrigger>
              <TabsTrigger value="settings">{tr('career.settings')}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview"><PlacementOverview onGoto={setTab} /></TabsContent>
          <TabsContent value="students"><PlacementStudents /></TabsContent>
          <TabsContent value="readiness"><PlacementReadiness /></TabsContent>
          <TabsContent value="drives"><PlacementDrives /></TabsContent>
          <TabsContent value="settings"><PlacementSettings /></TabsContent>
        </Tabs>
        {ctx!.college.departments.length === 0 && tab !== 'settings' && (
          <Panel className="border-primary/30 bg-primary/5 p-5 text-sm text-foreground">{tr('career.startByAddingDepartmentsAndBatches4bc')}{' '}<button type="button" className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setTab('settings')}>{tr('career.settings')}</button>{tr('career.thenInviteStudents')}</Panel>
        )}
      </div>
    </ConsoleContext.Provider>
  )
}
