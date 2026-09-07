'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Eye, Loader2, AlertTriangle,
  FileCheck, Globe, User, CreditCard, MapPin, Smartphone, AlertCircle
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Trash2, Mail } from 'lucide-react'

interface KycRecord {
  id: string
  user_id: string
  user_name?: string
  user_email?: string
  provider: string
  status: 'approved' | 'rejected' | 'manual_review' | 'pending'
  document_type?: string
  full_name?: string
  document_number?: string
  issuing_state?: string
  front_image?: string
  back_image?: string
  portrait_image?: string
  liveness_score?: number
  liveness_image?: string
  face_match_similarity?: number
  face_match_source?: string
  face_match_target?: string
  vpn_detected?: boolean
  ip_address?: string
  ip_city?: string
  device?: string
  browser?: string
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
  const [diditDetails, setDiditDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => { void fetchData() }, [])

  async function fetchDiditDetails(sessionId: string) {
    setLoadingDetails(true)
    try {
      const res = await csrfFetch(`/api/kyc/didit/session/${sessionId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setDiditDetails(data)
      }
    } catch { /* ignore */ }
    setLoadingDetails(false)
  }

  async function fetchData() {
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

// ... (some lines unchanged, jumping to columns)
  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this KYC record?')) return
    try {
      const res = await csrfFetch(`/api/admin/kyc?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRecords(records.filter(r => r.id !== id))
        setStats(s => ({ ...s, total: s.total - 1 }))
      }
    } catch { /* ignore */ }
  }

  const handleKycMail = async (r: KycRecord, type: 'reminder' | 'reverify') => {
    try {
      const res = await csrfFetch('/api/admin/kyc/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: r.user_id, type }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error || 'Request failed')
      addToast({ type: 'success', title: type === 'reminder' ? 'Reminder email sent!' : 'Re-verification requested' })
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to send email', message: e instanceof Error ? e.message : 'Failed' })
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
    { key: 'document_type', header: 'Document', cell: (r) => r.document_type || '—' },
    { key: 'liveness_score', header: 'Liveness', cell: (r) => r.liveness_score ? `${r.liveness_score}/100` : '—' },
    { key: 'face_match_similarity', header: 'Face Match', cell: (r) => r.face_match_similarity ? `${r.face_match_similarity}%` : '—' },
    { key: 'created_at', header: 'Date', cell: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
    { key: 'actions', header: 'Actions', cell: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(r); setDiditDetails(null); void fetchDiditDetails(r.id) }} title="View Details">
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleKycMail(r, 'reminder')} title="Send Reminder">
          <Mail className="h-4 w-4 text-blue-500" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleKycMail(r, 'reverify')} title="Request Re-verify">
          <ShieldCheck className="h-4 w-4 text-amber-500" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)} title="Delete Record">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
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
        <Card className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{stats.total}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Approved</p><p className="text-2xl font-bold text-emerald-500">{stats.approved}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Rejected</p><p className="text-2xl font-bold text-destructive">{stats.rejected}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-2xl font-bold text-blue-500">{stats.pending}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">In Review</p><p className="text-2xl font-bold text-amber-500">{stats.manual_review}</p></Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading records...
        </div>
      ) : (
        <DataTable columns={columns} data={records} searchPlaceholder="Search by name or email..." searchKeys={['user_name', 'user_email']} loading={loading} emptyMessage="No KYC records yet." />
      )}

      {/* Detail Modal — Full Didit-style view */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedRecord(null)}>
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">{selectedRecord.full_name || selectedRecord.user_name || 'User'}</h3>
                <p className="text-sm text-muted-foreground">{selectedRecord.user_email}</p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedRecord.status)}
                <Button variant="ghost" size="sm" onClick={() => setSelectedRecord(null)}>×</Button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Document Information */}
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-primary" /> Document Information
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Full Name</p><p className="font-medium">{selectedRecord.full_name || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Document Type</p><p className="font-medium">{selectedRecord.document_type || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Document Number</p><p className="font-medium font-mono text-xs">{selectedRecord.document_number || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Issuing Country</p><p className="font-medium">{selectedRecord.issuing_state || '—'}</p></div>
                </div>
              </div>

              {/* Document Images */}
              {(selectedRecord.front_image || selectedRecord.back_image || selectedRecord.portrait_image) && (
                <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Submitted Documents
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">Note: Document images expire 4 hours after verification.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedRecord.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Front</p>
                        <img src={selectedRecord.front_image} alt="ID Front" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {selectedRecord.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Back</p>
                        <img src={selectedRecord.back_image} alt="ID Back" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {selectedRecord.portrait_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Portrait</p>
                        <img src={selectedRecord.portrait_image} alt="Portrait" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Biometric Verification */}
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Biometric Verification
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Liveness Score</p><p className="font-medium">{selectedRecord.liveness_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-muted-foreground">Face Match Similarity</p><p className="font-medium">{selectedRecord.face_match_similarity ?? '—'}%</p></div>
                </div>
                {/* Face match images */}
                {(selectedRecord.face_match_source || selectedRecord.face_match_target) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {selectedRecord.face_match_source && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Photo</p>
                        <img src={selectedRecord.face_match_source} alt="ID Photo" className="w-full h-28 object-cover rounded-lg border border-border" />
                      </div>
                    )}
                    {selectedRecord.face_match_target && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Selfie</p>
                        <img src={selectedRecord.face_match_target} alt="Selfie" className="w-full h-28 object-cover rounded-lg border border-border" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Device & Location */}
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Device & Location
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">IP Address</p><p className="font-medium font-mono text-xs">{selectedRecord.ip_address || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedRecord.ip_city || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Device</p><p className="font-medium">{selectedRecord.device || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Browser</p><p className="font-medium">{selectedRecord.browser || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">VPN Detected</p><p className="font-medium">{selectedRecord.vpn_detected ? 'Yes' : 'No'}</p></div>
                </div>
              </div>

              {/* Full Didit Details (loaded from API) */}
              {loadingDetails && (
                <div className="p-4 rounded-lg border border-border/50 bg-background/50 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading full details from Didit...</span>
                </div>
              )}
              {diditDetails && (
                <div className="p-4 rounded-lg border border-border/50 bg-background/50 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Full Verification Details
                  </h4>
                  {/* User Info */}
                  {diditDetails.vendor_data && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">Vendor Data (User ID)</p>
                      <p className="font-mono">{diditDetails.vendor_data}</p>
                    </div>
                  )}
                  {/* Session Info */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {diditDetails.session_id && (
                      <div><p className="text-muted-foreground">Session ID</p><p className="font-mono">{diditDetails.session_id}</p></div>
                    )}
                    {diditDetails.workflow_id && (
                      <div><p className="text-muted-foreground">Workflow</p><p className="font-medium">{diditDetails.workflow_id}</p></div>
                    )}
                    {diditDetails.status && (
                      <div><p className="text-muted-foreground">Status</p><p className="font-medium">{diditDetails.status}</p></div>
                    )}
                  </div>
                  {/* Raw Decision Summary */}
                  {diditDetails.decision && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View raw decision data</summary>
                      <pre className="mt-2 p-2 rounded bg-muted text-[10px] overflow-x-auto max-h-40">
                        {JSON.stringify(diditDetails.decision, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <span>Provider: {selectedRecord.provider}</span>
                <span>{selectedRecord.created_at ? new Date(selectedRecord.created_at).toLocaleString() : '—'}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
