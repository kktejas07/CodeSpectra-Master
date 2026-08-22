'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Upload, Loader2, Trash2, Plus, Search } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, UserPlus } from 'lucide-react'
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
    { key: 'size', header: 'Size', cell: (r) => <span className="text-xs text-muted-foreground">{formatSize(r.file_size || 0)}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.status === 'processed' ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'}>
        {r.status || 'pending'}
      </Badge>
    )},
    { key: 'date', header: 'Uploaded', cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span> },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6 w-full pb-10">
      
      {/* Top Section: Templates */}
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-6 overflow-hidden">
        <h2 className="text-xl font-bold text-foreground mb-6 tracking-tight">Choose from a wide variety of templates</h2>
        
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar -mx-2 px-2">
          {/* Create New Card */}
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 hover:border-blue-500/50 transition-all group">
            <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
              <Plus className="h-7 w-7 text-white" />
            </div>
            <span className="text-blue-600 font-bold text-lg">Create a</span>
            <span className="text-blue-600 font-bold text-lg">new resume</span>
          </div>
          
          {/* Mock Template 1 */}
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-xl border border-border bg-muted/20 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 transition-all p-4 shadow-sm group">
             <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-muted overflow-hidden border">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Abhiram" alt="Avatar" className="h-full w-full object-cover" />
             </div>
             <div className="h-4 w-24 bg-foreground/80 rounded mb-2" />
             <div className="h-2 w-16 bg-muted-foreground/60 rounded mb-8" />
             
             <div className="space-y-4">
               <div>
                 <div className="h-2 w-12 bg-blue-500/80 rounded mb-2" />
                 <div className="space-y-1">
                   <div className="h-1.5 w-full bg-border rounded" />
                   <div className="h-1.5 w-5/6 bg-border rounded" />
                   <div className="h-1.5 w-4/6 bg-border rounded" />
                 </div>
               </div>
               <div>
                 <div className="h-2 w-16 bg-blue-500/80 rounded mb-2" />
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
             <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          {/* Mock Template 2 (Selected) */}
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-xl border-2 border-blue-500 bg-blue-50/30 dark:bg-blue-900/10 relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 transition-all p-3 shadow-md group flex">
             {/* Two column layout mock */}
             <div className="w-1/3 border-r border-blue-200/50 pr-2 pt-2">
                <div className="h-2 w-12 bg-blue-500 rounded mb-4" />
                <div className="space-y-2 mb-6">
                  <div className="h-1.5 w-full bg-blue-200 dark:bg-blue-800 rounded" />
                  <div className="h-1.5 w-5/6 bg-blue-200 dark:bg-blue-800 rounded" />
                  <div className="h-1.5 w-4/6 bg-blue-200 dark:bg-blue-800 rounded" />
                </div>
                <div className="h-2 w-10 bg-blue-500 rounded mb-2" />
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-blue-200 dark:bg-blue-800 rounded" />
                  <div className="h-1.5 w-3/4 bg-blue-200 dark:bg-blue-800 rounded" />
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
             <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

          {/* Mock Template 3 (Dark Header) */}
          <div onClick={handleTemplateClick} className="shrink-0 w-[240px] h-[320px] rounded-xl border border-border bg-card relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 transition-all shadow-sm group flex flex-col">
             <div className="h-16 bg-slate-800 p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 overflow-hidden shrink-0">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=ProductDesigner" alt="Avatar" className="h-full w-full object-cover" />
                </div>
                <div>
                  <div className="h-2.5 w-24 bg-white/90 rounded mb-1.5" />
                  <div className="h-1.5 w-16 bg-white/60 rounded" />
                </div>
             </div>
             <div className="p-3 flex-1 flex gap-3">
               <div className="w-1/3">
                 <div className="h-2 w-12 bg-slate-700/80 dark:bg-slate-300/80 rounded mb-2" />
                 <div className="space-y-1.5 mb-4">
                   <div className="h-1 w-full bg-border rounded" />
                   <div className="h-1 w-5/6 bg-border rounded" />
                 </div>
                 <div className="h-2 w-10 bg-slate-700/80 dark:bg-slate-300/80 rounded mb-2" />
                 <div className="space-y-1">
                   <div className="h-1 w-full bg-border rounded" />
                   <div className="h-1 w-3/4 bg-border rounded" />
                 </div>
               </div>
               <div className="w-2/3 border-l border-border/50 pl-3">
                 <div className="h-2 w-16 bg-slate-700/80 dark:bg-slate-300/80 rounded mb-3" />
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
             <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>

        </div>
      </div>

      {/* Bottom Section: My Resumes */}
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-6 min-h-[400px] flex flex-col">
        <h2 className="text-xl font-bold text-foreground mb-6 tracking-tight">My Resumes</h2>
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-blue-500" />Loading resumes...
          </div>
        ) : resumes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="w-64 h-64 relative mb-6 opacity-80">
              <svg viewBox="0 0 400 400" className="w-full h-full">
                {/* Simplified Astronaut/Magnifying Glass Illustration */}
                <circle cx="200" cy="200" r="120" fill="currentColor" className="text-blue-50 dark:text-blue-950" />
                <path d="M120 280 L200 280 L200 360" stroke="currentColor" strokeWidth="8" fill="none" className="text-blue-100 dark:text-blue-900" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M280 120 L280 200 L360 200" stroke="currentColor" strokeWidth="8" fill="none" className="text-blue-100 dark:text-blue-900" strokeLinecap="round" strokeLinejoin="round" />
                
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
                <circle cx="100" cy="100" r="4" fill="currentColor" className="text-blue-300" />
                <circle cx="300" cy="80" r="6" fill="currentColor" className="text-blue-400" />
                <circle cx="120" cy="300" r="5" fill="currentColor" className="text-blue-300" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-foreground">No Resume available</h3>
          </div>
        ) : (
          <div className="flex-1">
            <DataTable
              columns={columns}
              data={resumes}
              searchPlaceholder="Search resumes..."
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
              You have the option to either use data from your profile to create a new resume or create fresh resume. Choose your preferred method.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <div 
              onClick={() => setCreationOption('profile')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'profile' 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                  : 'border-border hover:border-blue-300 hover:bg-muted/50'
              }`}
            >
              <User className="h-5 w-5" />
              <span className="font-semibold">Fetch From Profile</span>
            </div>
            <div 
              onClick={() => setCreationOption('new')}
              className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-3 transition-all ${
                creationOption === 'new' 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                  : 'border-border hover:border-blue-300 hover:bg-muted/50'
              }`}
            >
              <UserPlus className="h-5 w-5" />
              <span className="font-semibold">Create new Resume</span>
            </div>
          </div>
          <DialogFooter className="sm:justify-between w-full flex gap-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => setCreationModalOpen(false)}>Cancel</Button>
            <Button className="flex-1 rounded-full bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={handleProceed}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
