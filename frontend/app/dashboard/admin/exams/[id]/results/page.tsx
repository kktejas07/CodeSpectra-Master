'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, Download, ShieldAlert, CheckCircle2, User, Eye, ExternalLink, X } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn } from '@/components/ui/data-table'

interface CandidateResult {
  id: string
  name: string
  email: string
  status: string
  score: number | null
  submittedAt: string | null
  proctoringFlags: number
  idPhoto?: string | null
  facePhoto?: string | null
}

interface Exam {
  id: string
  title: string
  level: string
  duration: number
}

export default function ExamResultsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const params = useParams()
  
  const [exam, setExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<CandidateResult[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateResult | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/exams/${params.id}/results`, { credentials: 'include' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load results')
        setExam(json.exam)
        setResults(json.results || [])
      } catch {
        addToast({ type: 'error', title: 'Failed to load results' })
        router.push('/dashboard/admin/exams')
      } finally {
        setLoading(false)
      }
    }
    if (params.id) fetchData()
  }, [params.id, router])

  const columns: DataTableColumn<CandidateResult>[] = [
    {
      key: 'name',
      header: 'Candidate',
      cell: (row: CandidateResult) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: CandidateResult) => {
        const badges: Record<string, React.ReactNode> = {
          pending: <Badge variant="outline" className="text-muted-foreground">Invited</Badge>,
          in_progress: <Badge variant="outline" className="text-blue-500 border-blue-500/20">In Progress</Badge>,
          completed: <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white">Completed</Badge>,
          expired: <Badge variant="secondary" className="text-amber-500">Expired</Badge>,
        }
        return badges[row.status] || <Badge variant="outline">{row.status}</Badge>
      },
    },
    {
      key: 'proctoringFlags',
      header: 'Integrity',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-2">
          {row.proctoringFlags === 0 ? (
            <span className="text-emerald-500 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Clean</span>
          ) : (
            <span className="text-rose-500 text-xs flex items-center gap-1 font-bold">
              <ShieldAlert className="w-3 h-3"/> {row.proctoringFlags} Flags
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      cell: (row: CandidateResult) => (
        <div className="font-mono font-medium">
          {row.score !== null ? `${row.score}%` : '--'}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row: CandidateResult) => (
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={row.status !== 'completed'}
            onClick={() => setSelectedCandidate(row)}
            className="text-xs h-8"
          >
            <User className="w-3.5 h-3.5 mr-1.5 text-primary" /> Verify ID
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={row.status !== 'completed'}
            className="text-xs h-8"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Review
          </Button>
        </div>
      ),
    },
  ]

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading results...
      </div>
    )
  }

  if (!exam) return null

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer text-sm mb-2" onClick={() => router.push('/dashboard/admin/exams')}>
            <ArrowLeft className="h-4 w-4" /> Back to Exams
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Results: {exam.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{exam.level}</Badge>
            <Badge variant="outline">{exam.duration} mins</Badge>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {results.filter(r => r.status === 'completed').length} Submitted
            </Badge>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
              {results.length} Total Invited
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-1">
        <DataTable 
          data={results} 
          columns={columns} 
          searchKeys={['name', 'email']}
          searchPlaceholder="Search candidates..."
        />
      </div>

      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="max-w-2xl w-full rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-lg">Candidate Identity Verification</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedCandidate.name} ({selectedCandidate.email})</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-6 py-2">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Government ID Photo</span>
                <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                  {selectedCandidate.idPhoto ? (
                    <img src={selectedCandidate.idPhoto} alt="Government ID" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No ID photo captured</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block text-center">Live Face Capture</span>
                <div className="aspect-4/3 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                  {selectedCandidate.facePhoto ? (
                    <img src={selectedCandidate.facePhoto} alt="Face Selfie" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No face photo captured</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <Button variant="outline" onClick={() => setSelectedCandidate(null)}>Close</Button>
              <Button 
                onClick={() => {
                  addToast({ type: 'success', title: 'Identity Verified', message: `Identity for ${selectedCandidate.name} has been verified.` })
                  setSelectedCandidate(null)
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Verified
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
