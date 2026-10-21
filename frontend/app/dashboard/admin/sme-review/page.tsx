'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Users, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { RefreshCw, ClipboardCheck, Flag } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QuestionDraftsReview } from '@/components/question-bot/QuestionDraftsReview'
import { useAdminT } from '@/lib/i18n/admin'

interface ReviewTask {
  id: string
  title: string
  candidateName: string
  type: string
  score: number
  status: string
  flags: string[]
}

export default function SMEReviewPage() {
  const gate = usePageGuard('tenant_admin')
  const { t } = useAdminT()
  // Question drafts (the platform bank) are superadmin only; ?tab=drafts opens them.
  const isSuper = gate.user?.role === 'superadmin'
  const tabParam = useSearchParams().get('tab')
  const [tab, setTab] = useState('answers')
  useEffect(() => { if (tabParam === 'drafts' && isSuper) setTab('drafts') }, [tabParam, isSuper])
  const [tasks, setTasks] = useState<ReviewTask[]>([])
  const [loading, setLoading] = useState(true)

  const [loadError, setLoadError] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sme-reviews', { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to load review tasks (${res.status})`)
      const json = await res.json()
      setTasks(json.data || [])
      setLoadError(false)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const columns: DataTableColumn<ReviewTask>[] = [
    { key: 'title', header: t('sme.colTask'), cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'candidate', header: t('sme.colCandidate'), cell: (r) => r.candidateName },
    { key: 'type', header: t('common.type'), cell: (r) => <Badge variant="outline">{r.type}</Badge> },
    { key: 'score', header: t('common.score'), cell: (r) => <span className="font-semibold tabular-nums">{r.score}/100</span> },
    { key: 'status', header: t('common.status'), cell: (r) => r.status },
    { key: 'flags', header: t('sme.colFlags'), cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.flags || []).map(f => <Badge key={f} variant="outline" className="border-red-500/30 bg-red-500/10 text-[11px] text-red-700 dark:text-red-400">{f}</Badge>)}
      </div>
    )},
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="assessment"
        title={t('sme.title')}
        description={t('sme.description')}
        icon={<Users />}
        actions={<Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{t('common.refresh')}</Button>}
      />

      {(() => {
        const answersView = (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label={t('sme.reviewTasks')} value={tasks.length} icon={<ClipboardCheck />} />
              <StatCard label={t('sme.withFlags')} value={tasks.filter((t) => (t.flags || []).length > 0).length} icon={<Flag />} />
            </div>

            {loading ? (
              <SkeletonTable />
            ) : (
              <DataTable columns={columns} data={tasks} searchKeys={['title', 'candidateName']} loading={loading} emptyState={loadError ? { illustration: 'error', title: t('sme.loadFailed'), description: t('common.checkConnection'), actionLabel: t('common.tryAgain'), onAction: () => void fetchData() } : { illustration: 'assessment' }} emptyMessage={t('sme.empty')} />
            )}
          </div>
        )
        if (!isSuper) return answersView
        return (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="answers">{t('sme.tabAnswers')}</TabsTrigger>
              <TabsTrigger value="drafts">{t('sme.tabDrafts')}</TabsTrigger>
            </TabsList>
            <TabsContent value="answers" className="mt-6">{answersView}</TabsContent>
            <TabsContent value="drafts" className="mt-6"><QuestionDraftsReview /></TabsContent>
          </Tabs>
        )
      })()}
    </div>
  )
}
