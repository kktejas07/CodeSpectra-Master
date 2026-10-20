'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Eye, Loader2, AlertTriangle,
  FileCheck, Globe, User, CreditCard, MapPin, Smartphone, AlertCircle
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { Users } from 'lucide-react'
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
  const confirmDialog = useConfirm()
  const [records, setRecords] = useState<KycRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      } else {
        addToast({ type: 'error', title: "Couldn't load the verification details", message: `HTTP ${res.status}. Try again in a moment.` })
      }
    } catch {
      addToast({ type: 'error', title: "Couldn't load the verification details", message: 'Check your connection and try again.' })
    }
    setLoadingDetails(false)
  }

  async function fetchData() {
    setLoadError(null)
    try {
      const res = await csrfFetch('/api/admin/kyc', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { records: KycRecord[]; stats: KycStats }
        setRecords(data.records || [])
        setStats(data.stats || { total: 0, approved: 0, rejected: 0, pending: 0, manual_review: 0 })
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setLoadError(j.error || `Couldn't load identity checks (HTTP ${res.status}).`)
      }
    } catch {
      setLoadError("Couldn't load identity checks. Check your connection and try again.")
    }
    setLoading(false)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>
      case 'rejected': return <Badge variant="danger"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
      case 'manual_review': return <Badge variant="warning"><Eye className="h-3 w-3 mr-1" />Review</Badge>
      case 'pending': return <Badge variant="info"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete this record?', description: 'Delete this identity check record? This cannot be undone.', confirmText: 'Delete', destructive: true }))) return
    try {
      const res = await csrfFetch(`/api/admin/kyc?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setRecords((rs) => rs.filter(r => r.id !== id))
      setStats(s => ({ ...s, total: Math.max(0, s.total - 1) }))
      addToast({ type: 'success', title: 'Record deleted' })
    } catch (e) {
      addToast({ type: 'error', title: "Couldn't delete the record", message: e instanceof Error ? e.message : 'Try again.' })
    }
  }

  // Decide a session Didit sent to manual review (PATCH /api/admin/kyc).
  const handleReview = async (r: KycRecord, decision: 'approved' | 'rejected') => {
    if (!(await confirmDialog({ title: decision === 'approved' ? 'Approve this identity check?' : 'Reject this identity check?', description: `${r.user_name || r.user_email || 'This person'} will be marked as ${decision === 'approved' ? 'verified' : 'not verified'}.`, confirmText: decision === 'approved' ? 'Approve' : 'Reject', destructive: decision === 'rejected' }))) return
    try {
      const res = await csrfFetch('/api/admin/kyc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, decision }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setRecords((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: decision } : x)))
      setStats((st) => ({ ...st, manual_review: Math.max(0, st.manual_review - 1), [decision]: st[decision] + 1 }))
      addToast({ type: 'success', title: decision === 'approved' ? 'Identity check approved' : 'Identity check rejected' })
    } catch (e) {
      addToast({ type: 'error', title: 'Could not save the decision', message: e instanceof Error ? e.message : 'Failed' })
    }
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
        <p className="font-medium text-foreground">{r.user_name || 'Unknown'}</p>
        <p className="text-xs text-muted-foreground">{r.user_email}</p>
      </div>
    )},
    { key: 'status', header: 'Status', cell: (r) => getStatusBadge(r.status) },
    { key: 'document_type', header: 'Document', cell: (r) => r.document_type || '—' },
    { key: 'liveness_score', header: 'Liveness', cell: (r) => <span className="tabular-nums">{r.liveness_score ? `${r.liveness_score}/100` : '—'}</span> },
    { key: 'face_match_similarity', header: 'Face match', cell: (r) => <span className="tabular-nums">{r.face_match_similarity ? `${r.face_match_similarity}%` : '—'}</span> },
    { key: 'created_at', header: 'Date', cell: (r) => r.created_at ? formatDate(r.created_at) : '—' },
    { key: 'actions', header: 'Actions', cell: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(r); setDiditDetails(null); void fetchDiditDetails(r.id) }} title="View details" aria-label="View details">
          <Eye className="h-4 w-4" />
        </Button>
        {r.status === 'manual_review' ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => void handleReview(r, 'approved')} title="Approve" aria-label="Approve identity check">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleReview(r, 'rejected')} title="Reject" aria-label="Reject identity check">
              <XCircle className="h-4 w-4 text-destructive" />
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void handleKycMail(r, 'reminder')} title="Send reminder" aria-label="Send reminder email">
          <Mail className="h-4 w-4 text-primary" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleKycMail(r, 'reverify')} title="Ask to verify again" aria-label="Ask to verify again">
          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)} title="Delete record" aria-label="Delete record">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    )},
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="security"
        title="Identity checks (KYC)"
        description="ID document, liveness and face-match results for people who verified their identity."
        icon={<ShieldCheck />}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="All checks" value={stats.total} icon={<Users />} />
        <StatCard label="Approved" value={<span className="text-green-600 dark:text-green-400">{stats.approved}</span>} icon={<CheckCircle2 />} />
        <StatCard label="Rejected" value={<span className="text-destructive">{stats.rejected}</span>} icon={<XCircle />} />
        <StatCard label="Pending" value={stats.pending} icon={<Clock />} />
        <StatCard label="Needs review" value={<span className="text-amber-600 dark:text-amber-400">{stats.manual_review}</span>} icon={<Eye />} />
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      ) : loadError ? (
        <EmptyState illustration="error" title="Couldn't load identity checks" description={loadError} actionLabel="Try again" onAction={() => { setLoading(true); void fetchData() }} />
      ) : (
        <DataTable columns={columns} data={records} searchPlaceholder="Search by name or email..." searchKeys={['user_name', 'user_email']} loading={loading} emptyState={{ illustration: 'security' }} emptyMessage="No identity checks yet. They appear here when candidates verify their ID." />
      )}

      {/* Detail Modal — Full Didit-style view */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) setSelectedRecord(null) }}>
        {selectedRecord && (
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold text-foreground">{selectedRecord.full_name || selectedRecord.user_name || 'User'}</DialogTitle>
                <DialogDescription className="break-all text-sm text-muted-foreground">{selectedRecord.user_email}</DialogDescription>
              </div>
              {getStatusBadge(selectedRecord.status)}
            </div>

            <div className="space-y-4">
              {/* Document Information */}
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileCheck className="h-4 w-4 text-primary" /> Document
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Full name</p><p className="font-medium">{selectedRecord.full_name || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Document type</p><p className="font-medium">{selectedRecord.document_type || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Document number</p><p className="font-medium font-mono text-xs">{selectedRecord.document_number || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Issuing country</p><p className="font-medium">{selectedRecord.issuing_state || '—'}</p></div>
                </div>
              </div>

              {/* Document Images */}
              {(selectedRecord.front_image || selectedRecord.back_image || selectedRecord.portrait_image) && (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CreditCard className="h-4 w-4 text-primary" /> Submitted images
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">Images are deleted 4 hours after verification.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedRecord.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID front</p>
                        <img src={selectedRecord.front_image} alt="ID front" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {selectedRecord.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID back</p>
                        <img src={selectedRecord.back_image} alt="ID back" className="w-full h-40 object-contain rounded-lg border border-border" />
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
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Liveness and face match
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Liveness score</p><p className="font-medium tabular-nums">{selectedRecord.liveness_score ?? '—'}/100</p></div>
                  <div><p className="text-xs text-muted-foreground">Face match</p><p className="font-medium tabular-nums">{selectedRecord.face_match_similarity ?? '—'}%</p></div>
                </div>
                {/* Face match images */}
                {(selectedRecord.face_match_source || selectedRecord.face_match_target) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {selectedRecord.face_match_source && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID photo</p>
                        <img src={selectedRecord.face_match_source} alt="ID photo" className="w-full h-28 object-cover rounded-lg border border-border" />
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
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe className="h-4 w-4 text-primary" /> Device and location
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">IP address</p><p className="font-medium font-mono text-xs">{selectedRecord.ip_address || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedRecord.ip_city || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Device</p><p className="font-medium">{selectedRecord.device || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Browser</p><p className="font-medium">{selectedRecord.browser || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">VPN detected</p><p className="font-medium">{selectedRecord.vpn_detected ? 'Yes' : 'No'}</p></div>
                </div>
              </div>

              {/* Full Didit Details (loaded from API) */}
              {loadingDetails && (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                  <span className="text-sm text-muted-foreground">Loading full details from Didit...</span>
                </div>
              )}
              {diditDetails && (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Full verification details
                  </h4>
                  {/* User Info */}
                  {diditDetails.vendor_data && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">User ID sent to provider</p>
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
                      <pre className="mt-2 max-h-40 overflow-x-auto rounded-lg bg-muted p-2 font-mono text-[11px]">
                        {JSON.stringify(diditDetails.decision, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <span>Provider: {selectedRecord.provider}</span>
                <span>{selectedRecord.created_at ? formatDateTime(selectedRecord.created_at) : '—'}</span>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
