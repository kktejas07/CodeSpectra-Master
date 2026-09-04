'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { MessageSquareWarning, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Feedback {
  _id: string
  id: string
  type: string
  content: string
  user_id?: string
  status: 'open' | 'resolved'
  created_at: string
}

export default function AdminFeedbackPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const confirm = useConfirm()
  
  const [data, setData] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/feedback', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) {
        setData(json.map((item: any) => ({ ...item, id: item._id })))
      } else {
        addToast({ type: 'error', title: 'Failed to load feedback', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load feedback' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const handleUpdateStatus = async (id: string, status: 'open' | 'resolved') => {
    try {
      const res = await csrfFetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Status updated' })
        setData(prev => prev.map(f => f._id === id ? { ...f, status } : f))
      } else {
        addToast({ type: 'error', title: 'Update failed' })
      }
    } catch {
      addToast({ type: 'error', title: 'Update failed' })
    }
  }

  const handleDelete = async (ids: string[]) => {
    const ok = await confirm({
      title: 'Delete Feedback?',
      description: `Are you sure you want to delete ${ids.length} item(s)?`,
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return

    let successCount = 0
    for (const id of ids) {
      try {
        const res = await csrfFetch(`/api/admin/feedback/${id}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        if (res.ok) successCount++
      } catch {
        // ignore individual failures in bulk
      }
    }

    if (successCount > 0) {
      addToast({ type: 'success', title: `Deleted ${successCount} item(s)` })
      setData(prev => prev.filter(f => !ids.includes(f._id)))
    }
  }

  const columns: DataTableColumn<Feedback>[] = useMemo(() => [
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      cell: (item: Feedback) => (
        <Badge variant={item.type === 'bug' ? 'destructive' : item.type === 'complaint' ? 'secondary' : 'default'} className="capitalize text-[10px]">
          {item.type}
        </Badge>
      )
    },
    {
      key: 'content',
      header: 'Content',
      cell: (item: Feedback) => (
        <div className="max-w-md truncate text-sm" title={item.content}>
          {item.content}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: Feedback) => (
        <Badge variant={item.status === 'open' ? 'outline' : 'secondary'} className="capitalize text-[10px] cursor-pointer" onClick={(e) => {
          e.stopPropagation()
          void handleUpdateStatus(item._id, item.status === 'open' ? 'resolved' : 'open')
        }}>
          {item.status}
        </Badge>
      )
    },
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      cell: (item: Feedback) => (
        <span className="text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      )
    }
  ], [])

  const bulkActions: BulkAction[] = useMemo(() => [
    {
      label: 'Mark Resolved',
      onClick: async (ids: string[]) => {
        for (const id of ids) {
          // Just update it, the backend checks validity
          await handleUpdateStatus(id, 'resolved')
        }
      },
      icon: <Badge variant="secondary" className="h-4 w-4 p-0 mr-1 flex items-center justify-center rounded-full">✓</Badge>
    },
    {
      label: 'Delete',
      onClick: (ids: string[]) => handleDelete(ids),
      destructive: true
    }
  ], [handleDelete])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <MessageSquareWarning className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="flex items-center gap-1.5 text-3xl font-bold text-foreground">
              Feedback & Reports
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-62.5">View and manage user feedback, bug reports, and complaints.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
            <p className="text-sm text-muted-foreground">Monitor platform issues reported by users</p>
          </div>
        </div>
      </div>

      <Card className="border-border/60">
        <DataTable
          data={data}
          columns={columns}
          bulkActions={bulkActions}
          searchPlaceholder="Search feedback content..."
          emptyMessage="No feedback reports found."
          loading={loading}
        />
      </Card>
    </div>
  )
}
