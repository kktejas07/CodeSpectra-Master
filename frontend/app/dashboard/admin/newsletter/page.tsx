'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Mail, Send, Users as UsersIcon, CheckCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'

interface Subscriber {
  id: string
  email: string
  source?: string
  status: 'subscribed' | 'unsubscribed'
  created_at: string
}

export default function NewsletterPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [total, setTotal] = useState(0)
  const [subscribed, setSubscribed] = useState(0)
  const [loading, setLoading] = useState(true)

  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/newsletter/subscribers?limit=200', { cache: 'no-store' })
      const data = await res.json()
      setSubscribers(data.subscribers || [])
      setTotal(data.total || 0)
      setSubscribed(data.subscribed || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const send = async () => {
    if (!subject.trim() || !content.trim()) {
      addToast({ type: 'error', title: 'Subject and content are required' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/newsletter/subscribers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), content: content.trim() }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Newsletter sent to ${data.sent} subscribers` })
      setSubject('')
      setContent('')
    } catch {
      addToast({ type: 'error', title: 'Failed to send newsletter' })
    } finally { setSending(false) }
  }

  if (!gate.ready) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Newsletter</h1>
          <p className="text-sm text-muted-foreground">Send email updates to newsletter subscribers</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{subscribed}</p>
          <p className="text-xs text-muted-foreground">Active subscribers</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground">Total signups</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{total - subscribed}</p>
          <p className="text-xs text-muted-foreground">Unsubscribed</p>
        </Card>
      </div>

      {/* Compose */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Send className="h-4 w-4" /> New Newsletter
        </h2>
        <div className="space-y-4">
          <div>
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="mt-1.5"
              placeholder="What's new on CodeSpectra this month"
              maxLength={120}
            />
          </div>
          <div>
            <Label>Content</Label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm min-h-[160px] resize-y"
              placeholder="Write your update. Supports simple HTML (headings, lists, links)."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Sends to all <strong>{subscribed}</strong> active subscribers with a branded CodeSpectra template + unsubscribe link.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={send} disabled={sending || subscribed === 0} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {subscribed} subscriber{subscribed === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Subscribers */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <UsersIcon className="h-4 w-4" /> Subscribers
        </h2>
        {loading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : subscribers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No subscribers yet. The signup form is on the landing page.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {subscribers.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{s.email}</span>
                  <Badge variant="outline" className="text-[10px]">{s.source || 'web'}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.status === 'subscribed' ? (
                    <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" /> Subscribed
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Unsubscribed</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
