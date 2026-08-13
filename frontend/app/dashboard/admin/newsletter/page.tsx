'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Mail, Send, Users as UsersIcon, CheckCircle, Eye, Clock,
  BarChart3, Trash2, Copy, ExternalLink, AlertCircle, Image as ImageIcon,
  Megaphone, Calendar, XCircle, RotateCcw
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Campaign {
  id: string
  campaign_id: string
  subject: string
  hero_image?: string
  intro?: string
  body: string
  cta_text?: string
  cta_url?: string
  include_upcoming: boolean
  channels: { email: boolean; push: boolean; in_app: boolean }
  recipients_count: number
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled'
  send_at?: string | null
  email_ok: number
  email_fail: number
  push_ok: number
  push_fail: number
  in_app_ok: number
  created_at: string
  completed_at?: string | null
  created_by: string
}

interface CampaignStats {
  totalCampaigns: number
  totalEmailsSent: number
  totalEmailsFailed: number
  totalPushSent: number
  totalInAppSent: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-gray-500/15 text-gray-600', icon: <XCircle className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', color: 'bg-blue-500/15 text-blue-600', icon: <Clock className="h-3 w-3" /> },
  sending: { label: 'Sending', color: 'bg-amber-500/15 text-amber-600', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: 'Completed', color: 'bg-green-500/15 text-green-600', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: 'Failed', color: 'bg-red-500/15 text-red-600', icon: <AlertCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500/15 text-gray-600', icon: <XCircle className="h-3 w-3" /> },
}

export default function NewsletterPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  // Campaigns data
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({ totalCampaigns: 0, totalEmailsSent: 0, totalEmailsFailed: 0, totalPushSent: 0, totalInAppSent: 0 })
  const [recipientCount, setRecipientCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Compose state
  const [subject, setSubject] = useState('')
  const [heroImage, setHeroImage] = useState('')
  const [intro, setIntro] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendPush, setSendPush] = useState(true)
  const [sendInApp, setSendInApp] = useState(true)
  const [scheduleAt, setScheduleAt] = useState('')
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Test send state
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState<'compose' | 'campaigns'>('compose')

  // Polling for sending campaigns
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const [campaignsRes, countRes] = await Promise.all([
        fetch('/api/newsletter/admin/campaigns', { cache: 'no-store' }),
        fetch('/api/newsletter/admin/recipient-count', { cache: 'no-store' }),
      ])
      const campaignsData = await campaignsRes.json()
      const countData = await countRes.json()
      setCampaigns(campaignsData.campaigns || [])
      setStats(campaignsData.stats || { totalCampaigns: 0, totalEmailsSent: 0, totalEmailsFailed: 0, totalPushSent: 0, totalInAppSent: 0 })
      setRecipientCount(countData.count || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  // Poll sending campaigns
  useEffect(() => {
    const hasSending = campaigns.some(c => c.status === 'sending')
    if (hasSending && !pollRef.current) {
      pollRef.current = setInterval(() => {
        load()
      }, 3000)
    } else if (!hasSending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [campaigns, load])

  const handleSend = async (asDraft = false) => {
    if (!subject.trim()) {
      addToast({ type: 'error', title: 'Subject is required' })
      return
    }
    if (asDraft) {
      setSavingDraft(true)
    } else {
      setSending(true)
    }
    try {
      const res = await csrfFetch('/api/newsletter/admin/campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          hero_image: heroImage.trim(),
          intro: intro.trim(),
          body: body.trim(),
          cta_text: ctaText.trim(),
          cta_url: ctaUrl.trim(),
          channels: { email: sendEmail, push: sendPush, in_app: sendInApp },
          send_at: scheduleAt || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: asDraft ? 'Draft saved' : `Campaign ${data.status === 'scheduled' ? 'scheduled' : 'sent'} to ${data.recipients_count} subscribers` })
      if (!asDraft) {
        setSubject(''); setHeroImage(''); setIntro(''); setBody(''); setCtaText(''); setCtaUrl(''); setScheduleAt('')
      }
      setActiveTab('campaigns')
      load()
    } catch {
      addToast({ type: 'error', title: 'Failed to save campaign' })
    } finally {
      setSending(false)
      setSavingDraft(false)
    }
  }

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const res = await csrfFetch('/api/newsletter/admin/send-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          subject: subject || 'Preview',
          hero_image: heroImage,
          intro,
          body,
          cta_text: ctaText,
          cta_url: ctaUrl,
        }),
      })
      const data = await res.json()
      if (data.html) setPreviewHtml(data.html)
    } catch {
      addToast({ type: 'error', title: 'Failed to generate preview' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleTestSend = async () => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      addToast({ type: 'error', title: 'Valid email required' })
      return
    }
    if (!subject.trim()) {
      addToast({ type: 'error', title: 'Subject is required for test send' })
      return
    }
    setTestSending(true)
    try {
      const res = await csrfFetch('/api/newsletter/admin/send-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail.trim(),
          subject: subject.trim(),
          hero_image: heroImage,
          intro,
          body,
          cta_text: ctaText,
          cta_url: ctaUrl,
        }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Test email sent to ${testEmail}` })
      setTestEmail('')
    } catch {
      addToast({ type: 'error', title: 'Failed to send test email' })
    } finally {
      setTestSending(false)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/newsletter/admin/campaigns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: 'Campaign deleted' })
      load()
    } catch {
      addToast({ type: 'error', title: 'Failed to delete campaign' })
    }
  }

  const handleCopyLink = (campaignId: string) => {
    const url = `${window.location.origin}/api/newsletter/admin/campaigns/${campaignId}`
    navigator.clipboard.writeText(url)
    addToast({ type: 'success', title: 'Campaign link copied' })
  }

  if (!gate.ready) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading…
    </div>
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Newsletter</h1>
            <p className="text-sm text-muted-foreground">Create and manage newsletter campaigns</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === 'compose' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('compose')}>
            <Send className="h-4 w-4 mr-1" /> Compose
          </Button>
          <Button variant={activeTab === 'campaigns' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('campaigns')}>
            <BarChart3 className="h-4 w-4 mr-1" /> Campaigns
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{recipientCount}</p>
          <p className="text-xs text-muted-foreground">Active Subscribers</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold">{stats.totalCampaigns}</p>
          <p className="text-xs text-muted-foreground">Campaigns Sent</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.totalEmailsSent.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Emails Delivered</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{stats.totalEmailsFailed}</p>
          <p className="text-xs text-muted-foreground">Emails Failed</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.totalPushSent + stats.totalInAppSent}</p>
          <p className="text-xs text-muted-foreground">Push + In-App Sent</p>
        </Card>
      </div>

      {activeTab === 'compose' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Compose Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Send className="h-4 w-4" /> Compose Newsletter
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>Subject *</Label>
                  <Input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="mt-1.5"
                    placeholder="What's new on CodeSpectra this month"
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label>Hero Image URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={heroImage}
                    onChange={e => setHeroImage(e.target.value)}
                    className="mt-1.5"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div>
                  <Label>Intro Text <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={intro}
                    onChange={e => setIntro(e.target.value)}
                    className="mt-1.5"
                    placeholder="A brief introduction paragraph..."
                  />
                </div>
                <div>
                  <Label>Body Content (HTML supported)</Label>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm min-h-[200px] resize-y font-mono"
                    placeholder="<p>Write your newsletter content here. Supports HTML formatting.</p>"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CTA Button Text <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      value={ctaText}
                      onChange={e => setCtaText(e.target.value)}
                      className="mt-1.5"
                      placeholder="Read More"
                    />
                  </div>
                  <div>
                    <Label>CTA Button URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      value={ctaUrl}
                      onChange={e => setCtaUrl(e.target.value)}
                      className="mt-1.5"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Channel Selection */}
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4" /> Delivery Channels
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email</span>
                    <Badge variant="outline" className="text-[10px]">{recipientCount} recipients</Badge>
                  </div>
                  <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Push Notification</span>
                  </div>
                  <Switch checked={sendPush} onCheckedChange={setSendPush} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">In-App Notification</span>
                  </div>
                  <Switch checked={sendInApp} onCheckedChange={setSendInApp} />
                </div>
              </div>
            </Card>

            {/* Schedule */}
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Schedule
              </h2>
              <div>
                <Label>Schedule for later <span className="text-muted-foreground text-xs">(leave empty to send immediately)</span></Label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={e => setScheduleAt(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => handleSend(true)} disabled={savingDraft || !subject.trim()}>
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Draft
              </Button>
              <Button onClick={() => handleSend(false)} disabled={sending || !subject.trim() || recipientCount === 0} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {scheduleAt ? 'Schedule Campaign' : `Send to ${recipientCount} subscribers`}
              </Button>
            </div>
          </div>

          {/* Preview & Test */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Eye className="h-4 w-4" /> Preview
              </h2>
              <Button variant="outline" onClick={handlePreview} disabled={previewLoading} className="w-full mb-4 gap-2">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Generate Preview
              </Button>
              {previewHtml ? (
                <div className="border rounded-lg overflow-hidden">
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-[500px] border-0"
                    title="Newsletter Preview"
                  />
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
                  Click "Generate Preview" to see how your newsletter will look
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Send className="h-4 w-4" /> Test Send
              </h2>
              <div className="space-y-3">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                />
                <Button variant="outline" onClick={handleTestSend} disabled={testSending || !testEmail.trim()} className="w-full gap-2">
                  {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Test Email
                </Button>
                <p className="text-xs text-muted-foreground">
                  Sends a test email with [Test] prefix to verify formatting
                </p>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* Campaign History */
        <Card className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Campaign History
          </h2>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No campaigns yet. Create your first newsletter!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft
                return (
                  <div key={c.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{c.subject}</h3>
                          <Badge className={`${statusCfg.color} border-0 gap-1`}>
                            {statusCfg.icon} {statusCfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{new Date(c.created_at).toLocaleDateString()}</span>
                          <span>{c.recipients_count} recipients</span>
                          {c.completed_at && <span>Completed {new Date(c.completed_at).toLocaleDateString()}</span>}
                        </div>
                        {/* Delivery Stats */}
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          {c.channels.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="text-green-600">{c.email_ok}</span>
                              {c.email_fail > 0 && <span className="text-red-500">/ {c.email_fail} failed</span>}
                            </span>
                          )}
                          {c.channels.push && (
                            <span className="flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" />
                              <span className="text-blue-600">{c.push_ok}</span>
                              {c.push_fail > 0 && <span className="text-red-500">/ {c.push_fail} failed</span>}
                            </span>
                          )}
                          {c.channels.in_app && (
                            <span className="flex items-center gap-1">
                              <Megaphone className="h-3 w-3" />
                              <span className="text-purple-600">{c.in_app_ok}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(c.status === 'draft' || c.status === 'scheduled') && (
                          <Button size="sm" variant="ghost" onClick={() => handleCopyLink(c.id)} title="Copy campaign link">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {c.status !== 'sending' && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteCampaign(c.id)} className="text-destructive hover:bg-destructive/10" title="Delete campaign">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
