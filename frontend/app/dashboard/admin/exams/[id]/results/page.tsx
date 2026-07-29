'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, Download, ShieldAlert, CheckCircle2, User, Eye, ExternalLink } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable } from '@/components/ui/data-table'
import type { DataTableColumn } from '@/components/ui/data-table'

interface CandidateResult {
  id: string
  name: string
  email: string
  status: 'invited' | 'in_progress' | 'completed' | 'time_expired' | 'flagged'
  score: number | null
  submittedAt: string | null
  proctoringFlags: number
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/exams`, { credentials: 'include' })
        const json = await res.json()
        const found = json.data?.find((e: Exam) => e.id === params.id)
        if (found) {
          setExam(found)
          // Mock Candidate Results
          setResults([
            { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', status: 'completed', score: 92, submittedAt: new Date().toISOString(), proctoringFlags: 0 },
            { id: 'c2', name: 'Bob Jones', email: 'bob@example.com', status: 'time_expired', score: 65, submittedAt: new Date(Date.now() - 3600000).toISOString(), proctoringFlags: 1 },
            { id: 'c3', name: 'Charlie Davis', email: 'charlie@example.com', status: 'flagged', score: null, submittedAt: new Date(Date.now() - 7200000).toISOString(), proctoringFlags: 5 },
            { id: 'c4', name: 'Diana Prince', email: 'diana@example.com', status: 'in_progress', score: null, submittedAt: null, proctoringFlags: 0 },
            { id: 'c5', name: 'Evan Wright', email: 'evan@example.com', status: 'invited', score: null, submittedAt: null, proctoringFlags: 0 },
          ])
        } else {
          addToast({ type: 'error', title: 'Exam not found' })
          router.push('/dashboard/admin/exams')
        }
      } catch {
        addToast({ type: 'error', title: 'Failed to load results' })
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
          invited: <Badge variant="outline" className="text-muted-foreground">Invited</Badge>,
          in_progress: <Badge variant="outline" className="text-blue-500 border-blue-500/20">In Progress</Badge>,
          completed: <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 text-white">Completed</Badge>,
          time_expired: <Badge variant="secondary" className="text-amber-500">Auto-Submitted</Badge>,
          flagged: <Badge variant="destructive" className="flex w-fit items-center gap-1"><ShieldAlert className="w-3 h-3"/> Flagged</Badge>
        }
        return badges[row.status] || badges.invited
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
      header: 'AI Score',
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
        <Button 
          variant="ghost" 
          size="sm" 
          disabled={row.status === 'invited' || row.status === 'in_progress'}
          className="text-xs h-8"
        >
          <Eye className="w-3.5 h-3.5 mr-1.5" /> Review Code
        </Button>
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
              {results.filter(r => r.status === 'completed' || r.status === 'time_expired').length} Submitted
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => window.open(`/assessment/${exam.id}`, '_blank')} className="gap-2">
            <ExternalLink className="w-4 h-4" /> View Candidate UI
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
    </div>
  )
}
