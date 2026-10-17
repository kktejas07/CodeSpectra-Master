'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { MessageSquareWarning, HelpCircle, Send, MessageSquare, Loader2, Inbox } from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { CheckCircle2, Bug } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Feedback {
  _id: string
  id: string
  type: string
  content: string
  user_id?: string
  user_name?: string
  user_email?: string
  source?: string
  entityType?: string
  entityId?: string
  entityTitle?: string
  contactEmail?: string
  userEmail?: string
  status: 'open' | 'resolved'
  created_at: string
  admin_reply?: string
  replied_at?: string
  replied_by?: string
}

function reporterLabel(f: Pick<Feedback, 'user_name' | 'user_email' | 'user_id'>): string {
  // ponytail: never render a sliced UID as a "name" — a truncated Firebase
  // UID (e.g. "DEljTlrD…") reads as a broken person name. No identity →
  // honest "Anonymous".
  return f.user_name || f.user_email || 'Anonymous'
}

/** Strip the legacy baked-in caption ("Report for [type] title: ...") that
 *  /api/reports used to prepend; context now lives in entity fields. */
function displayContent(content: string): string {
  return (content || '').replace(/^Report for \[[^\]]+\] [^:]+:\s*/, '')
}

export default function AdminFeedbackPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const confirm = useConfirm()

  const [data, setData] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/feedback', { credentials: 'include' })
      if (!res.ok) { setLoadError(true); return }
      const json = await res.json()
      if (Array.isArray(json)) {
        setData(json.map((item: any) => ({ ...item, id: item._id })))
      } else {
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const handleUpdateStatus = useCallback(async (id: string, status: 'open' | 'resolved') => {
    try {
      const res = await csrfFetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Status updated' })
        setData(prev => prev.map(f => f._id === id ? { ...f, status } : f))
      } else {
        addToast({ type: 'error', title: 'Update failed' })
      }
    } catch { addToast({ type: 'error', title: 'Update failed' }) }
  }, [addToast])

  const handleReply = useCallback(async (id: string) => {
    if (!replyText.trim()) return
    setReplying(true)
    try {
      const res = await csrfFetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_reply: replyText.trim(), status: 'resolved' })
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Reply sent' })
        setData(prev => prev.map(f => f._id === id ? {
          ...f, admin_reply: replyText.trim(), replied_at: new Date().toISOString(), status: 'resolved'
        } : f))
        setReplyText('')
      } else {
        addToast({ type: 'error', title: 'Reply failed' })
      }
    } catch { addToast({ type: 'error', title: 'Reply failed' }) }
    finally { setReplying(false) }
  }, [replyText, addToast])

  const handleDelete = useCallback(async (ids: string[]) => {
    const ok = await confirm({ title: 'Delete feedback?', description: `Delete ${ids.length} item(s)?`, confirmText: 'Delete', destructive: true })
    if (!ok) return
    let successCount = 0
    for (const id of ids) {
      try { const res = await csrfFetch(`/api/admin/feedback/${id}`, { method: 'DELETE', credentials: 'include' }); if (res.ok) successCount++ } catch {}
    }
    if (successCount > 0) {
      addToast({ type: 'success', title: `Deleted ${successCount} item(s)` })
      setData(prev => prev.filter(f => !ids.includes(f._id)))
    }
  }, [confirm, addToast])

  const columns: DataTableColumn<Feedback>[] = useMemo(() => [
    {
      key: 'type', header: 'Type', sortable: true,
      cell: (item) => <Badge variant={item.type === 'bug' ? 'destructive' : item.type === 'complaint' ? 'secondary' : 'default'} className="capitalize text-[11px]">{item.type}</Badge>
    },
    {
      key: 'content', header: 'Content',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <div className="max-w-xs truncate text-sm flex-1" title={displayContent(item.content)}>{displayContent(item.content)}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === item._id ? null : item._id); setReplyText('') }}
            className="shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            aria-expanded={expandedId === item._id}
          >
            {expandedId === item._id ? 'Close' : 'View'}
          </button>
        </div>
      )
    },
    {
      key: 'reporter', header: 'Reporter', sortable: true,
      cell: (item) => (
        <div className="min-w-0 max-w-[180px]" title={item.user_email || item.user_id || 'Anonymous'}>
          <p className="truncate text-sm font-medium">{reporterLabel(item)}</p>
          {item.user_email && item.user_name && (
            <p className="truncate text-[11px] text-muted-foreground">{item.user_email}</p>
          )}
        </div>
      )
    },
    {
      key: 'source', header: 'Source', sortable: true,
      cell: (item) => (
        item.source
          ? <Badge variant="outline" className="text-[11px] capitalize">{item.source}</Badge>
          : <span className="text-[11px] text-muted-foreground">—</span>
      )
    },
    {
      key: 'status', header: 'Status', sortable: true,
      cell: (item) => (
        <Badge variant={item.status === 'open' ? 'outline' : 'secondary'} className="capitalize text-[11px] cursor-pointer"
          title="Click to toggle open / resolved"
          onClick={(e) => { e.stopPropagation(); void handleUpdateStatus(item._id, item.status === 'open' ? 'resolved' : 'open') }}>
          {item.status}
        </Badge>
      )
    },
    {
      key: 'created_at', header: 'Date', sortable: true,
      cell: (item) => <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
    },
  ], [handleUpdateStatus])

  const bulkActions: BulkAction[] = useMemo(() => [
    { label: 'Mark resolved', onClick: async (ids) => { for (const id of ids) await handleUpdateStatus(id, 'resolved') },
      icon: <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden /> },
    { label: 'Delete', onClick: (ids) => handleDelete(ids), destructive: true },
  ], [handleUpdateStatus, handleDelete])

  const expandedFeedback = expandedId ? data.find(f => f._id === expandedId) : null

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Feedback and reports
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="ml-1.5 inline-block h-4 w-4 cursor-help align-middle text-muted-foreground" aria-label="About feedback" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs max-w-62.5">View and manage user feedback. Click View on a row to read it in full and reply.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
        description="Bugs, complaints and suggestions people have sent in. Reply to close the loop."
        icon={<MessageSquareWarning />}
      />

      {!loadError && !loading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Open" value={data.filter((f) => f.status === 'open').length} icon={<Inbox />} />
          <StatCard label="Resolved" value={data.filter((f) => f.status === 'resolved').length} icon={<CheckCircle2 />} />
          <StatCard label="Bug reports" value={data.filter((f) => f.type === 'bug').length} icon={<Bug />} />
        </div>
      )}

      {/* Error state */}
      {loadError && !loading && (
        <Panel className="flex flex-col items-center p-8 text-center">
          <Inbox className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">Feedback couldn&apos;t be loaded</p>
          <p className="mt-1 text-xs text-muted-foreground">If nobody has sent feedback yet there may be nothing to show. Try again in a moment.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void fetchData()}>Retry</Button>
        </Panel>
      )}

      {/* Table — no Card wrapper needed */}
      {!loadError && (
        <div className="space-y-4">
          <DataTable
            data={data}
            columns={columns}
            bulkActions={bulkActions}
            searchPlaceholder="Search feedback, reporter, source..."
            searchKeys={['content', 'user_name', 'user_email', 'source', 'type', 'status']}
            emptyMessage="No feedback yet. Reports people send from the app will appear here."
            loading={loading}
          />

          {/* Expanded detail panel */}
          {expandedFeedback && (
            <Panel className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Feedback detail</h3>
                <Button variant="ghost" size="sm" onClick={() => { setExpandedId(null); setReplyText('') }}>Close</Button>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Full message</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{displayContent(expandedFeedback.content)}</p>
                {(expandedFeedback.entityType || expandedFeedback.entityTitle) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Regarding:{' '}
                    <span className="font-medium text-foreground">
                      {expandedFeedback.entityType ? `[${expandedFeedback.entityType}] ` : ''}{expandedFeedback.entityTitle || ''}
                    </span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Reported by:{' '}
                    <span className="font-medium text-foreground">{reporterLabel(expandedFeedback)}</span>
                    {expandedFeedback.user_email && expandedFeedback.user_name && (
                      <span> ({expandedFeedback.user_email})</span>
                    )}
                  </span>
                  {expandedFeedback.source && (
                    <span>
                      Source: <span className="font-medium text-foreground capitalize">{expandedFeedback.source}</span>
                    </span>
                  )}
                  {expandedFeedback.user_id && (
                    <span className="font-mono">ID: {expandedFeedback.user_id}</span>
                  )}
                </div>
              </div>
              {expandedFeedback.admin_reply ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Admin reply</span>
                    {expandedFeedback.replied_at && (
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(expandedFeedback.replied_at)}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{expandedFeedback.admin_reply}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your response..."
                    aria-label="Reply to this feedback"
                    className="w-full min-h-[80px] resize-none rounded-xl border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={replying || !replyText.trim()} onClick={() => void handleReply(expandedFeedback._id)}>
                      {replying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                      Send reply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setExpandedId(null); setReplyText('') }}>Cancel</Button>
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
