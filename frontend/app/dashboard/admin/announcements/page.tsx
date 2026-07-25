'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Megaphone, Send, Eye, Clock, Users as UsersIcon,
  Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'

interface Announcement {
  id: string; title: string; message: string; link?: string
  user_id: string; created_at: string; is_read?: boolean
}

export default function AnnouncementsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [form, setForm] = useState<{ title: string; message: string; link: string; target: 'all' | 'user' | 'tenant_admin' | 'superadmin'; send_email: boolean }>({ title: '', message: '', link: '', target: 'all', send_email: false })
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState<Announcement[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/announcements?limit=20', { cache: 'no-store' })
      const data = await res.json()
      setHistory(data.announcements || [])
      setHistoryTotal(data.total || 0)
    } catch { /* ignore */ }
    finally { setLoadingHistory(false) }
  }, [])

  useEffect(() => { if (gate.ready) void loadHistory() }, [gate.ready, loadHistory])

  const send = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      addToast({ type: 'error', title: 'Title and message are required' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Announcement sent to ${data.sent} users` })
      setForm({ title: '', message: '', link: '', target: 'all', send_email: false })
      await loadHistory()
    } catch (e) {
      addToast({ type: 'error', title: 'Failed to send announcement' })
    } finally { setSending(false) }
  }

  const targetOptions: { value: typeof form.target; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'All Users', desc: 'Every registered user on the platform', icon: <UsersIcon className="h-4 w-4" /> },
    { value: 'user', label: 'Regular Users', desc: 'Standard user accounts only', icon: <UsersIcon className="h-4 w-4" /> },
    { value: 'tenant_admin', label: 'Org Admins', desc: 'Organization administrators', icon: <Shield className="h-4 w-4" /> },
    { value: 'superadmin', label: 'Platform Admins', desc: 'Superadmin accounts only', icon: <Shield className="h-4 w-4" /> },
  ]

  if (!gate.ready) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-muted-foreground">Broadcast notifications to users</p>
        </div>
      </div>

      {/* Compose */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Send className="h-4 w-4" /> New Announcement
        </h2>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="mt-1.5"
              placeholder="Platform maintenance scheduled for tonight"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground mt-1">{form.title.length}/100</p>
          </div>
          <div>
            <Label>Message</Label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
              placeholder="We will be performing scheduled maintenance tonight from 2:00 AM to 4:00 AM UTC. The platform may be temporarily unavailable."
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">{form.message.length}/500</p>
          </div>
          <div>
            <Label>Link (optional)</Label>
            <Input
              value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
              className="mt-1.5 font-mono text-sm"
              placeholder="https://codespectra.ai/blog/maintenance"
              type="url"
            />
          </div>

          <div>
            <Label>Send to</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {targetOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setForm(f => ({ ...f, target: opt.value }))}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors ${
                    form.target === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border/60 hover:border-primary/30'
                  }`}
                >
                  <span className="mt-0.5 text-muted-foreground">{opt.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  {form.target === opt.value && (
                    <CheckCircle className="h-4 w-4 text-primary ml-auto mt-0.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.send_email}
                onChange={e => setForm(f => ({ ...f, send_email: e.target.checked }))}
                className="rounded border-muted-foreground"
              />
              Also send as email
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(p => !p)}
                className="gap-1.5"
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                onClick={() => void send()}
                disabled={sending || !form.title.trim() || !form.message.trim()}
                className="gap-1.5"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {form.target === 'all' ? 'All Users' : targetOptions.find(o => o.value === form.target)?.label}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        {previewOpen && (
          <div className="mt-4 border-t border-border/40 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notification Preview</p>
            <div className="bg-muted/40 rounded-lg p-4 border border-border/60">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                  <Megaphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{form.title || '(no title)'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{form.message || '(no message)'}</p>
                  {form.link && <p className="text-xs text-primary mt-1">{form.link}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* History */}
      <Card className="p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Sent Announcements ({historyTotal})
        </h2>
        {loadingHistory ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No announcements sent yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map(ann => (
              <div key={ann.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{ann.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ann.message}</p>
                    {ann.link && (
                      <a
                        href={ann.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        {ann.link}
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      <Megaphone className="h-2.5 w-2.5 mr-0.5" />
                      Announcement
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}