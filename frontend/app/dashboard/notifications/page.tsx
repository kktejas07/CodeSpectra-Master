'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Bell, Loader2, CheckCheck, Trophy, Shield, CreditCard, Video, Search, Users, Award, LogIn, AlertTriangle, FileText, MessageSquare, Clock, Building, Key, Play, XCircle, Star, Mail } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'

const ICON_MAP: Record<string, React.ElementType> = {
  trophy: Trophy, shield: Shield, 'credit-card': CreditCard, video: Video,
  search: Search, users: Users, award: Award, 'log-in': LogIn,
  'alert-triangle': AlertTriangle, 'file-text': FileText, 'message-square': MessageSquare,
  clock: Clock, building: Building, key: Key, play: Play, 'x-circle': XCircle,
  'check-circle': Star, bell: Bell, 'user-plus': Users, 'alert-circle': AlertTriangle,
  mail: Mail,
}

interface Notification {
  id: string; title: string; message: string; type: string
  is_read: boolean; link?: string; icon?: string; category?: string
  created_at: string
  metadata?: { campaignId?: string; campaign_id?: string }
}

interface NewsletterPayload {
  id: string
  subject: string
  intro?: string
  body?: string
  hero_image?: string
  cta_text?: string
  cta_url?: string
  completed_at?: string
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

const DEFAULT_LINKS: Record<string, string> = {
  'auth.login': '/dashboard/profile',
  'auth.signup': '/dashboard',
  'auth.2fa_enabled': '/dashboard/settings',
  'auth.password_changed': '/dashboard/settings',
  'xp.awarded': '/dashboard/leaderboard',
  'xp.level_up': '/dashboard/leaderboard',
  'hackathon.results': '/dashboard/events',
  'hackathon.started': '/dashboard/events',
  'hackathon.ending_soon': '/dashboard/events',
  'hackathon.team_invite': '/dashboard/events',
  'hackathon.submission_status': '/dashboard/events',
  'hackathon.submission_accepted': '/dashboard/events',
  'hackathon.submission_rejected': '/dashboard/events',
  'assessment.results_released': '/dashboard/assessments',
  'interview.scheduled': '/dashboard/interviews',
  'interview.completed': '/dashboard/interviews',
  'certification.earned': '/dashboard/certifications',
  'certificate.issued': '/dashboard/certifications',
  'scan.completed': '/dashboard/projects',
  'team.invite': '/dashboard/team',
  'team.joined': '/dashboard/team',
}

function isNewsletter(n: Notification): boolean {
  return n.type === 'newsletter' || (n.type || '').startsWith('newsletter')
}

/** Prefer /newsletter/{id}; fall back to metadata; else "latest". */
function newsletterApiId(n: Notification): string {
  const raw = (n.link || '').trim()
  const fromLink = raw.match(/\/newsletter\/([^/?#]+)/)?.[1]
  if (fromLink && fromLink !== 'latest') return fromLink
  const meta = n.metadata
  const fromMeta = meta?.campaignId || meta?.campaign_id
  if (fromMeta) return String(fromMeta)
  return 'latest'
}

function resolveNotificationLink(n: Notification): string {
  const raw = (n.link || '').trim()
  if (raw && raw !== '/dashboard' && !isNewsletter(n)) return raw
  return DEFAULT_LINKS[n.type] || '/dashboard'
}

export default function NotificationsPage() {
  const gate = usePageGuard('user')
  const router = useRouter()

  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [unreadCount, setUnreadCount] = useState(0)

  const [newsletterOpen, setNewsletterOpen] = useState(false)
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [newsletter, setNewsletter] = useState<NewsletterPayload | null>(null)
  const [newsletterError, setNewsletterError] = useState('')

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

  useEffect(() => {
    const interval = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const openNewsletter = async (n: Notification) => {
    setNewsletterOpen(true)
    setNewsletter(null)
    setNewsletterError('')
    setNewsletterLoading(true)
    try {
      const id = newsletterApiId(n)
      const res = await fetch(`/api/newsletter/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setNewsletterError(data.error || 'Newsletter not found')
        return
      }
      setNewsletter(data)
    } catch {
      setNewsletterError('Failed to load newsletter')
    } finally {
      setNewsletterLoading(false)
    }
  }

  if (!gate.ready) return null

  const markAllRead = async () => {
    await csrfFetch('/api/notifications/mark-all-read', { method: 'POST' })
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const markRead = async (id: string) => {
    await csrfFetch(`/api/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) })
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
            const Icon = IconComponent(n.icon || 'bell') as React.ComponentType<{ className?: string }>
            return (
              <div key={n.id} className={`rounded-lg border transition-colors ${
                n.is_read ? 'border-border bg-card hover:bg-muted/30' : 'border-primary/30 bg-primary/10 hover:bg-primary/15'
              }`}>
                <div className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={async () => {
                    if (!n.is_read) await markRead(n.id)
                    if (isNewsletter(n)) {
                      await openNewsletter(n)
                      return
                    }
                    router.push(resolveNotificationLink(n))
                  }}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    n.is_read ? 'bg-muted' : 'bg-primary/15'
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
                      <span className="text-[10px] text-primary">
                        {isNewsletter(n) ? 'Tap to read →' : 'Tap to view →'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={newsletterOpen} onOpenChange={setNewsletterOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left text-xl leading-snug">
              {newsletterLoading ? 'Loading…' : (newsletter?.subject || 'Newsletter')}
            </DialogTitle>
            {newsletter?.completed_at && (
              <DialogDescription className="text-left">
                {new Date(newsletter.completed_at).toLocaleDateString()}
              </DialogDescription>
            )}
          </DialogHeader>

          {newsletterLoading && (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading newsletter…
            </div>
          )}

          {newsletterError && (
            <p className="text-sm text-destructive">{newsletterError}</p>
          )}

          {newsletter && !newsletterLoading && (
            <div className="space-y-4">
              {newsletter.hero_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={newsletter.hero_image}
                  alt=""
                  className="max-h-56 w-full rounded-lg object-cover"
                />
              )}
              {newsletter.intro && (
                <p className="text-sm text-muted-foreground leading-relaxed">{newsletter.intro}</p>
              )}
              {newsletter.body && (
                <div
                  className="prose prose-sm prose-zinc dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: newsletter.body }}
                />
              )}
              {newsletter.cta_text && newsletter.cta_url && (
                <a
                  href={newsletter.cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {newsletter.cta_text}
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
