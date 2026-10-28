'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Upload, Trash2, Plus, Search } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { UserAvatar } from '@/components/ui/user-avatar'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/app/page-kit'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

interface Resume {
  id: string
  file_name: string
  file_size: number
  status: string
  uploaded_at: string
}

interface DraftSummary {
  id: string
  name: string
  template?: string
  updated_at: string
}

export default function MyResumesPage() {
  const { formatDate } = useLocaleDates()
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [creationModalOpen, setCreationModalOpen] = useState(false)
  const [creationOption, setCreationOption] = useState<'profile' | 'new' | null>(null)
  const router = useRouter()

  const [loadError, setLoadError] = useState(false)

  const [drafts, setDrafts] = useState<DraftSummary[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [res, dres] = await Promise.all([
        fetch('/api/resumes', { credentials: 'include' }),
        fetch('/api/resumes/drafts?list=1', { credentials: 'include' }),
      ])
      if (!res.ok || !dres.ok) throw new Error(t('career.failedToLoadResumesStatus', { status: res.status }))
      const json = await res.json()
      const djson = await dres.json()
      // /api/resumes returns a plain array.
      setResumes(Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [])
      setDrafts(Array.isArray(djson?.drafts) ? djson.drafts : [])
      setLoadError(false)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }

  const deleteDraft = async (id: string) => {
    const res = await csrfFetch(`/api/resumes/drafts?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      addToast({ type: 'error', title: t('career.couldNotDeleteTheDraft') })
      return
    }
    setDrafts(prev => prev.filter(d => d.id !== id))
    addToast({ type: 'success', title: t('career.draftDeleted') })
  }

  useEffect(() => { fetchData() }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const resumesTour: TourStep[] = [
        {
          target: '[data-tour="resumes-templates"]',
          title: t('career.resumesWorkspaceOverview'),
          description: t('career.yourSpaceToBuildAndManage74b'),
          position: 'bottom',
        },
        {
          target: '[data-tour="resumes-create"]',
          title: t('career.startNewResume'),
          description: t('career.startAResumeFromProfileData7de'),
          position: 'bottom',
        },
        {
          target: '[data-tour="resumes-list"]',
          title: t('career.searchAndCleanUp'),
          description: t('career.tipSearchByFileNameAnddbf'),
          position: 'top',
        },
      ]
      autoPlayPageTour('resumes', resumesTour)}
  }, [gate.ready, startTour, setTourSeen])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/resumes/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: t('career.countResumesDeleted', { count: ids.length }) })
    setResumes(prev => prev.filter(r => !ids.includes(r.id)))
  }

  const handleTemplateClick = () => {
    setCreationOption(null)
    setCreationModalOpen(true)
  }

  const handleProceed = () => {
    if (!creationOption) {
      addToast({ type: 'error', title: t('career.pleaseSelectAnOption') })
      return
    }
    router.push(`/dashboard/resumes/builder?source=${creationOption}`)
  }

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`

  const columns: DataTableColumn<Resume>[] = [
    { key: 'name', header: t('career.file'), cell: (r) => <span className="font-medium">{r.file_name}</span> },
    { key: 'size', header: t('career.size'), cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{formatSize(r.file_size || 0)}</span> },
    { key: 'status', header: t('career.status'), cell: (r) => (
      <Badge className={`capitalize ${r.status === 'processed' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
        {r.status || t('career.pending')}
      </Badge>
    )},
    { key: 'date', header: t('career.uploaded'), cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{r.uploaded_at ? formatDate(r.uploaded_at) : '—'}</span> },
  ]

  const bulkActions: BulkAction[] = [
    { label: t('common.delete'), variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6 w-full pb-10">
      <PageHeader
        illustration="resume"
        className="mb-0"
        icon={<FileText aria-hidden />}
        title={t('career.resumes')}
        description={t('career.buildAResumeFromATemplate898')}
        actions={
          <Button onClick={handleTemplateClick}>
            <Plus className="mr-1 h-4 w-4" />{' '}{t('career.newResume')}</Button>
        }
      />

      {/* Top Section: Templates */}
      <div className="bg-card rounded-3xl border border-border/70 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none p-6 overflow-hidden" data-tour="resumes-templates">
        <h2 className="text-lg font-semibold text-foreground mb-5">{t('career.startFromATemplate')}</h2>
        
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar -mx-2 px-2">
          {/* Create New Card */}
          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} onClick={handleTemplateClick} data-tour="resumes-create" className="shrink-0 w-[240px] h-[320px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 hover:border-primary/50 transition-all duration-200 group">
            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200 motion-reduce:group-hover:scale-100 shadow-md">
              <Plus className="h-7 w-7 text-primary-foreground" aria-hidden />
            </div>
            <span className="text-primary font-bold text-lg">{t('career.createA')}</span>
            <span className="text-primary font-bold text-lg">{t('career.newResume2')}</span>
          </div>
          
          {/* Mock Template 1 */}
          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border border-border bg-muted/20 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 p-4 shadow-sm group">
              <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-muted overflow-hidden border">
                 <UserAvatar seed="Abhiram" name="Abhiram" className="h-full w-full" />
              </div>
             <div className="h-4 w-24 bg-foreground/80 rounded mb-2" />
             <div className="h-2 w-16 bg-muted-foreground/60 rounded mb-8" />
             
             <div className="space-y-4">
               <div>
                 <div className="h-2 w-12 bg-primary/80 rounded mb-2" />
                 <div className="space-y-1">
                   <div className="h-1.5 w-full bg-border rounded" />
                   <div className="h-1.5 w-5/6 bg-border rounded" />
                   <div className="h-1.5 w-4/6 bg-border rounded" />
                 </div>
               </div>
               <div>
                 <div className="h-2 w-16 bg-primary/80 rounded mb-2" />
                 <div className="space-y-2">
                   <div>
                     <div className="h-1.5 w-20 bg-foreground/60 rounded mb-1" />
                     <div className="h-1.5 w-full bg-border rounded" />
                   </div>
                   <div>
                     <div className="h-1.5 w-24 bg-foreground/60 rounded mb-1" />
                     <div className="h-1.5 w-4/5 bg-border rounded" />
                   </div>
                 </div>
               </div>
             </div>
             <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          {/* Mock Template 2 (Selected) */}
          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border-2 border-primary/60 bg-primary/5 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 p-3 shadow-md group flex">
             {/* Two column layout mock */}
             <div className="w-1/3 border-r border-primary/20 pr-2 pt-2">
                <div className="h-2 w-12 bg-primary rounded mb-4" />
                <div className="space-y-2 mb-6">
                  <div className="h-1.5 w-full bg-primary/25 rounded" />
                  <div className="h-1.5 w-5/6 bg-primary/25 rounded" />
                  <div className="h-1.5 w-4/6 bg-primary/25 rounded" />
                </div>
                <div className="h-2 w-10 bg-primary rounded mb-2" />
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-primary/25 rounded" />
                  <div className="h-1.5 w-3/4 bg-primary/25 rounded" />
                </div>
             </div>
             <div className="w-2/3 pl-3 pt-2">
                <div className="h-3 w-24 bg-foreground/90 rounded mb-1" />
                <div className="h-1.5 w-16 bg-muted-foreground rounded mb-6" />
                
                <div className="h-2 w-16 bg-foreground/80 rounded mb-3" />
                <div className="space-y-3">
                  <div>
                    <div className="h-1.5 w-20 bg-foreground/70 rounded mb-1" />
                    <div className="h-1.5 w-full bg-border rounded mb-0.5" />
                    <div className="h-1.5 w-5/6 bg-border rounded" />
                  </div>
                  <div>
                    <div className="h-1.5 w-24 bg-foreground/70 rounded mb-1" />
                    <div className="h-1.5 w-full bg-border rounded mb-0.5" />
                    <div className="h-1.5 w-11/12 bg-border rounded" />
                  </div>
                </div>
             </div>
             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          {/* Mock Template 3 (Dark Header) */}
          <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border border-border bg-card relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 shadow-sm group flex flex-col">
             <div className="h-16 bg-slate-800 p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 overflow-hidden shrink-0">
                  <UserAvatar seed="ProductDesigner" name="Product Designer" className="h-full w-full" />
                </div>
                <div>
                  <div className="h-2.5 w-24 bg-white/90 rounded mb-1.5" />
                  <div className="h-1.5 w-16 bg-white/60 rounded" />
                </div>
             </div>
             <div className="p-3 flex-1 flex gap-3">
               <div className="w-1/3">
                 <div className="h-2 w-12 bg-foreground/70 rounded mb-2" />
                 <div className="space-y-1.5 mb-4">
                   <div className="h-1 w-full bg-border rounded" />
                   <div className="h-1 w-5/6 bg-border rounded" />
                 </div>
                 <div className="h-2 w-10 bg-foreground/70 rounded mb-2" />
                 <div className="space-y-1">
                   <div className="h-1 w-full bg-border rounded" />
                   <div className="h-1 w-3/4 bg-border rounded" />
                 </div>
               </div>
               <div className="w-2/3 border-l border-border/50 pl-3">
                 <div className="h-2 w-16 bg-foreground/70 rounded mb-3" />
                 <div className="space-y-4">
                   <div>
                     <div className="h-1.5 w-20 bg-foreground/70 rounded mb-1.5" />
                     <div className="space-y-1">
                       <div className="h-1 w-full bg-border rounded" />
                       <div className="h-1 w-11/12 bg-border rounded" />
                       <div className="h-1 w-full bg-border rounded" />
                     </div>
                   </div>
                   <div>
                     <div className="h-1.5 w-24 bg-foreground/70 rounded mb-1.5" />
                     <div className="space-y-1">
                       <div className="h-1 w-full bg-border rounded" />
                       <div className="h-1 w-5/6 bg-border rounded" />
                     </div>
                   </div>
                 </div>
               </div>
             </div>
             <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

        </div>
      </div>

      {/* Builder drafts saved to the account */}
      {drafts.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/70 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t('career.yourDrafts')}</h2>
          <ul className="divide-y divide-border/60">
            {drafts.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{d.name || t('career.untitledResume')}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{t('common.saved')}{' '}{d.updated_at ? formatDate(d.updated_at) : '—'}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/resumes/builder?draft=${encodeURIComponent(d.id)}`)}>{t('career.open')}</Button>
                  <Button size="sm" variant="ghost" aria-label={t('career.deleteDraftValue', { value: d.name || 'Untitled resume' })} onClick={() => void deleteDraft(d.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom Section: My Resumes */}
      <div className="bg-card rounded-3xl border border-border/70 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none p-6 min-h-[400px] flex flex-col" data-tour="resumes-list">
        <h2 className="text-lg font-semibold text-foreground mb-5">{t('career.uploadedFiles')}</h2>
        
        {loading ? (
          <div className="flex-1 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : loadError && resumes.length === 0 ? (
          <EmptyState
            illustration="error"
            title={t('career.couldntLoadYourResumes')}
            description={t('career.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => void fetchData()}
            className="flex-1 border-0 bg-transparent"
          />
        ) : resumes.length === 0 ? (
          <EmptyState illustration="resume"
            title={drafts.length ? t('career.noUploadedFiles') : t('career.noResumesYet')}
            description={drafts.length
              ? t('career.yourBuilderDraftsAreListedAbove')
              : t('career.createOneFromATemplateAbove9c4')}
            className="flex-1 border-0 bg-transparent"
          />
        ) : (
          <div className="flex-1">
            <DataTable
              columns={columns}
              data={resumes}
              searchPlaceholder={t('career.searchResumes')}
              searchKeys={['file_name']}
              bulkActions={bulkActions}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* Creation Option Dialog */}
      <Dialog open={creationModalOpen} onOpenChange={setCreationModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-center">{t('career.chooseCreationOption')}</DialogTitle>
            <DialogDescription className="text-center pt-2">{t('career.startFromTheDetailsAlreadyOn3bd')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={creationOption === 'profile'}
              onClick={() => setCreationOption('profile')}
              className={`p-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'profile' 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              }`}
            >
              <User className="h-5 w-5" />
              <span className="font-semibold">{t('career.useMyProfile')}</span>
            </button>
            <button
              type="button"
              aria-pressed={creationOption === 'new'}
              onClick={() => setCreationOption('new')}
              className={`p-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'new' 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              }`}
            >
              <UserPlus className="h-5 w-5" />
              <span className="font-semibold">{t('career.startBlank')}</span>
            </button>
          </div>
          <DialogFooter className="sm:justify-between w-full flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setCreationModalOpen(false)}>{t('common.cancel')}</Button>
            <Button className="flex-1 rounded-full" onClick={handleProceed}>{t('career.proceed')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
