'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Bell, Loader2, CheckCheck, Filter, Trophy, Shield, CreditCard,
  Video, Search, Users, Award, LogIn, AlertTriangle, FileText,
  MessageSquare, Clock, Building, Key, Play, XCircle, Star,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  trophy: Trophy, shield: Shield, 'credit-card': CreditCard, video: Video,
  search: Search, users: Users, award: Award, 'log-in': LogIn,
  'alert-triangle': AlertTriangle, 'file-text': FileText, 'message-square': MessageSquare,
  clock: Clock, building: Building, key: Key, play: Play, 'x-circle': XCircle,
  'check-circle': Star, bell: Bell, 'user-plus': Users, 'alert-circle': AlertTriangle,
}

interface Notification {
  id: string; title: string; message: string; type: string
  is_read: boolean; link?: string; icon?: string; category?: string
  created_at: string
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'billing', label: 'Billing' },
  { id: 'interview', label: 'Interviews' },
  { id: 'code', label: 'Code Quality' },
  { id: 'account', label: 'Account' },
  { id: 'team', label: 'Team' },
  { id: 'learning', label: 'Learning' },
  { id: 'system', label: 'System' },
  { id: 'security', label: 'Security' },
]

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [unreadCount, setUnreadCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
        setUnreadCount(data.unread || 0)
      }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const markAllRead = async () => {
    await fetch('/api/notifications/mark-all-read', { method: 'POST' })
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) })
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const filtered = category === 'all'
    ? items
    : items.filter((n) => (n.category || 'general') === category || n.type.startsWith(category))

  const IconComponent = (icon: string) => ICON_MAP[icon] || Bell

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bell className="h-7 w-7 text-primary" /> Notifications
          {unreadCount > 0 && (
            <Badge variant="default" className="ml-2">{unreadCount} unread</Badge>
          )}
        </h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              category === c.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notifications…
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No notifications {category !== 'all' ? `in this category` : 'yet'}.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = IconComponent(n.icon || 'bell')
            return (
              <div key={n.id} className={`rounded-lg border transition-colors ${
                n.is_read ? 'border-border/40 bg-card/40' : 'border-primary/20 bg-primary/5'
              }`}>
                <div className={`flex items-start gap-3 p-4 ${n.link ? 'cursor-pointer hover:bg-muted/20' : ''}`}
                  onClick={async () => {
                    if (!n.is_read) await markRead(n.id)
                  }}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    n.is_read ? 'bg-muted/50' : 'bg-primary/10'
                  }`}>
                    <Icon className={`h-4 w-4 ${n.is_read ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.is_read ? 'text-muted-foreground' : 'font-medium'}`}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{n.type}</span>
                      {n.link && (
                        <Link href={n.link} className="text-[10px] text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          View details →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
