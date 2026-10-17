'use client'
import { formatDate } from '@/lib/format-datetime'

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

interface Resume {
  id: string
  file_name: string
  file_size: number
  status: string
  skills: string[]
  created_at: string
}

export default function MyResumesPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [creationModalOpen, setCreationModalOpen] = useState(false)
  const [creationOption, setCreationOption] = useState<'profile' | 'new' | null>(null)
  const router = useRouter()

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/resumes', { credentials: 'include' })
      const json = await res.json()
      setResumes(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const resumesTour: TourStep[] = [
        {
          target: '[data-tour="resumes-templates"]',
          title: 'Resumes workspace overview',
          description: 'Your space to build and manage resumes from templates or profile data.',
          position: 'bottom',
        },
        {
          target: '[data-tour="resumes-create"]',
          title: 'Start new resume',
          description: 'Start a resume from profile data or from scratch via the builder.',
          position: 'bottom',
        },
        {
          target: '[data-tour="resumes-list"]',
          title: 'Search and clean up',
          description: 'Tip: search by file name and select rows to delete resumes in bulk.',
          position: 'top',
        },
      ]
      autoPlayPageTour('resumes', resumesTour)}
  }, [gate.ready, startTour, setTourSeen])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/resumes/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} resume${ids.length !== 1 ? 's' : ''} deleted` })
    setResumes(prev => prev.filter(r => !ids.includes(r.id)))
  }

  const handleTemplateClick = () => {
    setCreationOption(null)
    setCreationModalOpen(true)
  }

  const handleProceed = () => {
    if (!creationOption) {
      addToast({ type: 'error', title: 'Please select an option' })
      return
    }
    router.push(`/dashboard/resumes/builder?source=${creationOption}`)
  }

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`

  const columns: DataTableColumn<Resume>[] = [
    { key: 'name', header: 'File', cell: (r) => <span className="font-medium">{r.file_name}</span> },
    { key: 'size', header: 'Size', cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{formatSize(r.file_size || 0)}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={`capitalize ${r.status === 'processed' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
        {r.status || 'pending'}
      </Badge>
    )},
    { key: 'date', header: 'Uploaded', cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{r.created_at ? formatDate(r.created_at) : '—'}</span> },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6 w-full pb-10">
      <PageHeader
        className="mb-0"
        icon={<FileText aria-hidden />}
        title="Resumes"
        description="Build a resume from a template or your profile, and keep the files you've uploaded in one place."
        actions={
          <Button onClick={handleTemplateClick}>
            <Plus className="mr-1 h-4 w-4" /> New resume
          </Button>
        }
      />

      {/* Top Section: Templates */}
      <div className="bg-card rounded-3xl border border-border/70 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none p-6 overflow-hidden" data-tour="resumes-templates">
        <h2 className="text-lg font-semibold text-foreground mb-5">Start from a template</h2>
        
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar -mx-2 px-2">
          {/* Create New Card */}
          <div onClick={handleTemplateClick} data-tour="resumes-create" className="shrink-0 w-[240px] h-[320px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 hover:border-primary/50 transition-all duration-200 group">
            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200 motion-reduce:group-hover:scale-100 shadow-md">
              <Plus className="h-7 w-7 text-primary-foreground" aria-hidden />
            </div>
            <span className="text-primary font-bold text-lg">Create a</span>
            <span className="text-primary font-bold text-lg">new resume</span>
          </div>
          
          {/* Mock Template 1 */}
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border border-border bg-muted/20 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 p-4 shadow-sm group">
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
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border-2 border-primary/60 bg-primary/5 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 p-3 shadow-md group flex">
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
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-2xl border border-border bg-card relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all duration-200 shadow-sm group flex flex-col">
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

      {/* Bottom Section: My Resumes */}
      <div className="bg-card rounded-3xl border border-border/70 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none p-6 min-h-[400px] flex flex-col" data-tour="resumes-list">
        <h2 className="text-lg font-semibold text-foreground mb-5">My resumes</h2>
        
        {loading ? (
          <div className="flex-1 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : resumes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-48 h-48 relative mb-6 opacity-80">
              <svg viewBox="0 0 400 400" className="w-full h-full" aria-hidden="true">
                {/* Simplified Astronaut/Magnifying Glass Illustration */}
                <circle cx="200" cy="200" r="120" fill="currentColor" className="text-primary/10" />
                <path d="M120 280 L200 280 L200 360" stroke="currentColor" strokeWidth="8" fill="none" className="text-primary/20" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M280 120 L280 200 L360 200" stroke="currentColor" strokeWidth="8" fill="none" className="text-primary/20" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Astronaut Body */}
                <path d="M170 200 Q200 150 230 200 L240 260 Q200 280 160 260 Z" fill="currentColor" className="text-foreground" />
                {/* Visor */}
                <circle cx="200" cy="180" r="25" fill="currentColor" className="text-background border-4 border-foreground" />
                {/* Backpack */}
                <rect x="150" y="190" width="20" height="50" rx="5" fill="currentColor" className="text-muted-foreground" />
                {/* Magnifying Glass */}
                <circle cx="260" cy="140" r="30" fill="none" stroke="currentColor" strokeWidth="8" className="text-foreground" />
                <line x1="280" y1="160" x2="310" y2="190" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-foreground" />
                {/* Stars/Details */}
                <circle cx="100" cy="100" r="4" fill="currentColor" className="text-primary/50" />
                <circle cx="300" cy="80" r="6" fill="currentColor" className="text-primary/70" />
                <circle cx="120" cy="300" r="5" fill="currentColor" className="text-primary/50" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground">No resumes yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create one from a template above — it will show up here.</p>
          </div>
        ) : (
          <div className="flex-1">
            <DataTable
              columns={columns}
              data={resumes}
              searchPlaceholder="Search resumes…"
              searchKeys={['file_name']}
              bulkActions={bulkActions}
              loading={loading}
            />
          </div>
        )}
      </div>

      {/* Creation Option Dialog */}
      <Dialog open={creationModalOpen} onOpenChange={setCreationModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-center">Choose creation option</DialogTitle>
            <DialogDescription className="text-center pt-2">
              Start from the details already on your profile, or begin with a blank resume.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
            <div 
              onClick={() => setCreationOption('profile')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'profile' 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              }`}
            >
              <User className="h-5 w-5" />
              <span className="font-semibold">Use my profile</span>
            </div>
            <div 
              onClick={() => setCreationOption('new')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'new' 
                  ? 'border-primary bg-primary/10 text-primary' 
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              }`}
            >
              <UserPlus className="h-5 w-5" />
              <span className="font-semibold">Start blank</span>
            </div>
          </div>
          <DialogFooter className="sm:justify-between w-full flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setCreationModalOpen(false)}>Cancel</Button>
            <Button className="flex-1 rounded-full" onClick={handleProceed}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
