'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ShieldCheck, Users, CheckCircle2, XCircle, Clock, Search,
  Loader2, Download, Eye, AlertTriangle
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface KycRecord {
  id: string
  user_id: string
  user_name?: string
  user_email?: string
  provider: string
  status: 'approved' | 'rejected' | 'manual_review' | 'pending'
  document_type?: string
  full_name?: string
  liveness_score?: number
  face_match_similarity?: number
  vpn_detected?: boolean
  created_at: string
}

interface KycStats {
  total: number
  approved: number
  rejected: number
  pending: number
  manual_review: number
}

export default function AdminKycPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [records, setRecords] = useState<KycRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<KycStats>({ total: 0, approved: 0, rejected: 0, pending: 0, manual_review: 0 })
  const [selectedRecord, setSelectedRecord] = useState<KycRecord | null>(null)

  useEffect(() => {
    void fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await csrfFetch('/api/admin/kyc', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { records: KycRecord[]; stats: KycStats }
        setRecords(data.records || [])
        setStats(data.stats || { total: 0, approved: 0, rejected: 0, pending: 0, manual_review: 0 })
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-500/20 text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>
      case 'rejected': return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
      case 'manual_review': return <Badge className="bg-amber-500/20 text-amber-700"><Eye className="h-3 w-3 mr-1" />Review</Badge>
      case 'pending': return <Badge className="bg-blue-500/20 text-blue-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const columns: DataTableColumn<KycRecord>[] = [
    { key: 'user_name', header: 'User', cell: (r) => (
      <div>
        <p className="font-medium">{r.user_name || 'Unknown'}</p>
        <p className="text-xs text-muted-foreground">{r.user_email}</p>
      </div>
    )},
    { key: 'status', header: 'Status', cell: (r) => getStatusBadge(r.status) },
    { key: 'provider', header: 'Provider', cell: (r) => <Badge variant="outline" className="text-xs">{r.provider}</Badge> },
    { key: 'document_type', header: 'Document', cell: (r) => r.document_type || '—' },
    { key: 'liveness_score', header: 'Liveness', cell: (r) => r.liveness_score ? `${r.liveness_score}/100` : '—' },
    { key: 'face_match_similarity', header: 'Face Match', cell: (r) => r.face_match_similarity ? `${r.face_match_similarity}%` : '—' },
    { key: 'created_at', header: 'Date', cell: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    { key: 'actions', header: '', cell: (r) => (
      <Button size="sm" variant="ghost" onClick={() => setSelectedRecord(r)}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
    )},
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">KYC Verification</h1>
          <p className="text-muted-foreground text-sm">Monitor identity verification across your organization</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Approved</p>
          <p className="text-2xl font-bold text-emerald-500">{stats.approved}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Rejected</p>
          <p className="text-2xl font-bold text-destructive">{stats.rejected}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-blue-500">{stats.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">In Review</p>
          <p className="text-2xl font-bold text-amber-500">{stats.manual_review}</p>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading records...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={records}
          searchPlaceholder="Search by name or email..."
          searchKeys={['user_name', 'user_email']}
          loading={loading}
          emptyMessage="No KYC records yet."
        />
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedRecord(null)}>
          <Card className="w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Verification Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRecord(null)}>×</Button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">User</p>
                  <p className="font-medium">{selectedRecord.user_name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getStatusBadge(selectedRecord.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p className="font-medium">{selectedRecord.provider}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Document Type</p>
                  <p className="font-medium">{selectedRecord.document_type || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Liveness Score</p>
                  <p className="font-medium">{selectedRecord.liveness_score ?? '—'}/100</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Face Match</p>
                  <p className="font-medium">{selectedRecord.face_match_similarity ?? '—'}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">VPN Detected</p>
                  <p className="font-medium">{selectedRecord.vpn_detected ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{selectedRecord.created_at ? new Date(selectedRecord.created_at).toLocaleString() : '—'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
