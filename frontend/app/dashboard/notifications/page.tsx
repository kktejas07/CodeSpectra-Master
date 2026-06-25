'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, ChevronRight, Loader2, CheckCheck } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'

type NotificationRow = {
  id: string
  type: string
  title: string | null
  message: string | null
  is_read: boolean | null
  read_at: string | null
  created_at: string
}

export default function NotificationsPage() {
  const addToast = useToast()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications', { credentials: 'include' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Could not load notifications')
    }
    if (!Array.isArray(data)) {
      throw new Error('Unexpected response')
    }
    setItems(data as NotificationRow[])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await load()
      } catch (e) {
        if (!cancelled) {
          addToast({
            type: 'error',
            title: 'Notifications',
            message: e instanceof Error ? e.message : 'Failed to load',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load, addToast])

  const markOneRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      credentials: 'include',
    })
    if (!res.ok) return
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    )
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === 'string' ? j.error : 'Could not mark all read')
      }
      setItems((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
      )
      addToast({ type: 'success', title: 'All caught up', message: 'Notifications marked as read.' })
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Could not update',
        message: e instanceof Error ? e.message : 'Try again',
      })
    } finally {
      setMarkingAll(false)
    }
  }

  const unread = items.filter((n) => !n.is_read).length

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Inbox for your account. Opening an item marks it read. Tune channels in preferences.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/notifications/preferences" className="gap-1">
              Preferences
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="sm"
            className="gap-2"
            disabled={unread === 0 || markingAll}
            onClick={() => void markAllRead()}
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all read
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 rounded-xl border-border/60 py-16 text-muted-foreground shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </Card>
      ) : items.length === 0 ? (
        <Card className="rounded-xl border-border/60 p-8 text-center text-muted-foreground shadow-sm">
          <p className="font-medium text-foreground">You&apos;re all set</p>
          <p className="mt-2 text-sm">No notifications yet. Product and challenge updates will show up here.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  if (!n.is_read) void markOneRead(n.id)
                }}
                className={cn(
                  'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                  n.is_read
                    ? 'border-border/60 bg-card hover:bg-muted/40'
                    : 'border-primary/25 bg-primary/5 hover:bg-primary/10'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{n.title || n.type}</p>
                    {n.message ? (
                      <p className="text-sm text-muted-foreground leading-snug">{n.message}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  {!n.is_read ? (
                    <Badge variant="secondary" className="shrink-0">
                      New
                    </Badge>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
