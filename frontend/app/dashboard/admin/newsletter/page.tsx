'use client'
import { formatDate } from '@/lib/format-datetime'

import { useCallback, useEffect, useState, useRef } from 'react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Mail, Send, Users as UsersIcon, CheckCircle, Eye, Clock,
  BarChart3, Trash2, Copy, ExternalLink, AlertCircle, Image as ImageIcon,
  Megaphone, Calendar, XCircle, MessageCircle, Upload, X, PencilLine, Newspaper
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { compressHtmlImages } from '@/lib/image-compress'
import EmailPreviewFrame from '@/components/newsletter/email-preview-frame'
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'

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
  channels: { email: boolean; push: boolean; in_app: boolean; whatsapp: boolean }
  recipients_count: number
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled'
  send_at?: string | null
  email_ok: number
  email_fail: number
  push_ok: number
  push_fail: number
  in_app_ok: number
  whatsapp_ok: number
  whatsapp_fail: number
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
  totalWhatsAppSent: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: <XCircle className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', color: 'bg-primary/10 text-primary', icon: <Clock className="h-3 w-3" /> },
  sending: { label: 'Sending', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: 'Completed', color: 'bg-green-500/15 text-green-700 dark:text-green-300', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: 'Failed', color: 'bg-red-500/15 text-red-700 dark:text-red-300', icon: <AlertCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground', icon: <XCircle className="h-3 w-3" /> },
}

// Content templates
const TEMPLATES = [
  { id: 'blank', label: 'Blank', body: '' },
  { id: 'update', label: 'Product update', body: '<h2>What\'s new</h2><p>We\'ve been working hard to bring you new features and improvements.</p><h3>Key highlights</h3><ul><li>Feature 1 - description</li><li>Feature 2 - description</li><li>Feature 3 - description</li></ul><p>Try these features today and let us know what you think!</p>' },
  { id: 'event', label: 'Event announcement', body: '<h2>You\'re invited!</h2><p>Join us for an exciting event that you won\'t want to miss.</p><p><strong>Date:</strong> [Date]<br><strong>Time:</strong> [Time]<br><strong>Location:</strong> [Location/Virtual]</p><p>Register now to secure your spot!</p>' },
  { id: 'digest', label: 'Weekly digest', body: '<h2>This week\'s highlights</h2><p>Here\'s what happened this week on CodeSpectra:</p><h3>🏆 Top performers</h3><p>Congratulations to our top contributors this week!</p><h3>📊 Platform stats</h3><ul><li>New users: [Number]</li><li>Challenges completed: [Number]</li><li>Certificates earned: [Number]</li></ul><h3>📅 Upcoming events</h3><p>Stay tuned for next week\'s activities!</p>' },
  { id: 'feature', label: 'Feature launch', body: '<h2>Introducing [Feature name]</h2><p>We\'re excited to announce a powerful new feature that will transform your experience.</p><h3>What it does</h3><p>[Describe the feature and its benefits]</p><h3>How to use it</h3><ol><li>Step 1</li><li>Step 2</li><li>Step 3</li></ol><p>Start using [Feature Name] today!</p>' },
]

/** Convert a stored timestamp to the local `<input type="datetime-local">` value. */
function toLocalInput(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NewsletterPage() {
  const { t: ta } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const heroFileRef = useRef<HTMLInputElement>(null)

  // Campaigns data
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({ totalCampaigns: 0, totalEmailsSent: 0, totalEmailsFailed: 0, totalPushSent: 0, totalInAppSent: 0, totalWhatsAppSent: 0 })
  const [recipientCount, setRecipientCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Compose state
  const [subject, setSubject] = useState('')
  const [heroImage, setHeroImage] = useState('')
  const [heroImagePreview, setHeroImagePreview] = useState('')
  const [intro, setIntro] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendPush, setSendPush] = useState(true)
  const [sendInApp, setSendInApp] = useState(true)
  const [sendWhatsapp, setSendWhatsapp] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [sending, setSending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  // When set, the composer edits this existing draft/scheduled campaign
  // (PATCH) instead of creating a new one (POST).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSizeKb, setPreviewSizeKb] = useState<number | null>(null)

  // Test send state
  const [testEmail, setTestEmail] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testWhatsappPhone, setTestWhatsappPhone] = useState('')
  const [testWhatsappSending, setTestWhatsappSending] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState<'compose' | 'campaigns'>('compose')

  // Polling for sending campaigns
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      const [campaignsRes, countRes] = await Promise.all([
        fetch('/api/newsletter/admin/campaigns', { cache: 'no-store' }),
        fetch('/api/newsletter/admin/recipient-count', { cache: 'no-store' }),
      ])
      if (!campaignsRes.ok) throw new Error(`Failed to load campaigns (${campaignsRes.status})`)
      const campaignsData = await campaignsRes.json()
      const countData = await countRes.json().catch(() => ({}))
      setLoadError(false)
      setCampaigns(campaignsData.campaigns || [])
      setStats(campaignsData.stats || { totalCampaigns: 0, totalEmailsSent: 0, totalEmailsFailed: 0, totalPushSent: 0, totalInAppSent: 0, totalWhatsAppSent: 0 })
      setRecipientCount(countData.count || 0)
    } catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  // Poll sending campaigns
  useEffect(() => {
    const hasSending = campaigns.some(c => c.status === 'sending')
    if (hasSending && !pollRef.current) {
      pollRef.current = setInterval(() => { load() }, 3000)
    } else if (!hasSending && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [campaigns, load])

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await csrfFetch('/api/upload', { method: 'POST', credentials: 'include', body: formData })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      setHeroImage(data.url)
      setHeroImagePreview(data.url)
      addToast({ type: 'success', title: 'Image uploaded' })
    } catch {
      addToast({ type: 'error', title: 'Failed to upload image' })
    } finally {
      setUploadingImage(false)
      if (heroFileRef.current) heroFileRef.current.value = ''
    }
  }

  const removeHeroImage = () => {
    setHeroImage('')
    setHeroImagePreview('')
  }

  // Retro-compress large base64 images already sitting in the draft body so a
  // legacy draft (or PNGs) can't silently stay over Gmail's clip limit. Same
  // canvas pipeline the editor runs on paste — identity when nothing to shrink.
  const optimizedBody = useCallback(async () => compressHtmlImages(body), [body])

  // Load a saved draft/scheduled campaign back into the composer so work can
  // continue exactly where it stopped. The composer re-mounts on tab switch,
  // so the new `body` is picked up by the RichTextEditor's mount effect.
  const resumeDraft = (c: Campaign) => {
    setEditingId(c.id)
    setSubject(c.subject || '')
    setHeroImage(c.hero_image || '')
    setHeroImagePreview(c.hero_image || '')
    setIntro(c.intro || '')
    setBody(c.body || '')
    setCtaText(c.cta_text || '')
    setCtaUrl(c.cta_url || '')
    setSendEmail(!!c.channels?.email)
    setSendPush(!!c.channels?.push)
    setSendInApp(!!c.channels?.in_app)
    setSendWhatsapp(!!c.channels?.whatsapp)
    setScheduleAt(c.send_at ? toLocalInput(c.send_at) : '')
    setActiveTab('compose')
    addToast({ type: 'success', title: `Resumed ${c.status === 'scheduled' ? 'scheduled campaign' : 'draft'}` })
  }

  const handleSend = async (asDraft = false) => {
    if (!subject.trim()) { addToast({ type: 'error', title: 'Subject is required' }); return }
    if (asDraft) setSavingDraft(true)
    else setSending(true)
    try {
      const bodyHtml = await optimizedBody()
      const payload = {
        subject: subject.trim(), hero_image: heroImage, intro: intro.trim(),
        body: bodyHtml, cta_text: ctaText.trim(), cta_url: ctaUrl.trim(),
        channels: { email: sendEmail, push: sendPush, in_app: sendInApp, whatsapp: sendWhatsapp },
      }
      let data: { error?: string; status?: string; recipients_count?: number }
      if (editingId) {
        const res = await csrfFetch(`/api/newsletter/admin/campaigns/${editingId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, send_at: asDraft ? undefined : (scheduleAt || undefined), send: !asDraft }),
        })
        data = await res.json()
      } else {
        const res = await csrfFetch('/api/newsletter/admin/campaigns', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, send_at: scheduleAt || undefined, preview_only: asDraft }),
        })
        data = await res.json()
      }
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: asDraft ? (editingId ? 'Draft updated' : 'Draft saved') : `Campaign ${data.status === 'scheduled' ? 'scheduled' : 'sent'} to ${data.recipients_count} subscribers` })
      if (!asDraft || editingId) {
        setSubject(''); setHeroImage(''); setHeroImagePreview(''); setIntro(''); setBody(''); setCtaText(''); setCtaUrl(''); setScheduleAt('')
      }
      setEditingId(null)
      setActiveTab('campaigns')
      load()
    } catch { addToast({ type: 'error', title: 'Failed to save campaign' }) }
    finally { setSending(false); setSavingDraft(false) }
  }

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const bodyHtml = await optimizedBody()
      const res = await csrfFetch('/api/newsletter/admin/send-test', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', subject: subject || 'Preview', hero_image: heroImage, intro, body: bodyHtml, cta_text: ctaText, cta_url: ctaUrl }),
      })
      const data = await res.json()
      if (data.html) setPreviewHtml(data.html)
      setPreviewSizeKb(typeof data.sizeKb === 'number' ? data.sizeKb : null)
      if (data.warning) addToast({ type: 'warning', title: data.warning })
    } catch { addToast({ type: 'error', title: 'Failed to generate preview' }) }
    finally { setPreviewLoading(false) }
  }

  const handleTestSend = async () => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) { addToast({ type: 'error', title: 'Valid email required' }); return }
    if (!subject.trim()) { addToast({ type: 'error', title: 'Subject is required' }); return }
    setTestSending(true)
    try {
      const bodyHtml = await optimizedBody()
      const res = await csrfFetch('/api/newsletter/admin/send-test', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim(), subject: subject.trim(), hero_image: heroImage, intro, body: bodyHtml, cta_text: ctaText, cta_url: ctaUrl }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      if (data.warning) addToast({ type: 'warning', title: data.warning })
      addToast({ type: 'success', title: `Test email sent to ${testEmail}` })
      setTestEmail('')
    } catch { addToast({ type: 'error', title: 'Failed to send test email' }) }
    finally { setTestSending(false) }
  }

  const handleTestWhatsapp = async () => {
    if (!testWhatsappPhone.trim()) { addToast({ type: 'error', title: 'Phone number required' }); return }
    setTestWhatsappSending(true)
    try {
      const res = await csrfFetch('/api/newsletter/admin/send-test-whatsapp', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testWhatsappPhone.trim(), message: subject ? `*${subject}*\n\n${intro || body?.replace(/<[^>]*>/g, '').slice(0, 200) || 'Test'}` : 'Test from CodeSpectra' }),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `WhatsApp sent to ${testWhatsappPhone}` })
      setTestWhatsappPhone('')
    } catch { addToast({ type: 'error', title: 'Failed to send WhatsApp' }) }
    finally { setTestWhatsappSending(false) }
  }

  const publishToBlog = async (id: string) => {
    try {
      const res = await csrfFetch('/api/blog/from-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id, publish: true }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        addToast({ type: 'error', title: data.error || 'Publish failed' })
        return
      }
      addToast({
        type: 'success',
        title: data.already ? 'Already on Newsroom' : 'Published to Newsroom',
      })
    } catch {
      addToast({ type: 'error', title: 'Failed to publish to Newsroom' })
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/newsletter/admin/campaigns/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: 'Campaign deleted' })
      load()
    } catch { addToast({ type: 'error', title: 'Failed to delete' }) }
  }

  if (!gate.ready) {
    return (
      <div className="space-y-6">
        <SkeletonStats />
        <SkeletonList count={2} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="inbox"
        icon={<Megaphone />}
        title={ta('nlAdm.newsletter')}
        description={ta('nlAdm.writeACampaignPreviewItSend')}
        actions={
          <>
            <Button variant={activeTab === 'compose' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('compose')}><Send className="h-4 w-4 mr-1" /> {ta('nlAdm.compose')}</Button>
            <Button variant={activeTab === 'campaigns' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('campaigns')}><BarChart3 className="h-4 w-4 mr-1" /> {ta('nlAdm.campaigns')}</Button>
          </>
        }
        className="mb-0"
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatCard label={ta('nlAdm.subscribers')} value={recipientCount} icon={<UsersIcon />} />
        <StatCard label={ta('nlAdm.campaigns')} value={stats.totalCampaigns} icon={<Megaphone />} />
        <StatCard label={ta('nlAdm.emailsSent')} value={stats.totalEmailsSent.toLocaleString()} icon={<Mail />} />
        <StatCard label={ta('nlAdm.failed')} value={<span className={stats.totalEmailsFailed > 0 ? 'text-red-600 dark:text-red-400' : undefined}>{stats.totalEmailsFailed}</span>} icon={<AlertCircle />} />
        <StatCard label={ta('nlAdm.pushAndInApp')} value={stats.totalPushSent + stats.totalInAppSent} icon={<ExternalLink />} />
        <StatCard label="WhatsApp" value={stats.totalWhatsAppSent || 0} icon={<MessageCircle />} />
      </div>

      {activeTab === 'compose' ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 space-y-6">
            {/* Compose */}
            <Panel>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" /> {ta('nlAdm.composeNewsletter')}
                  {editingId && <Badge variant="default"><PencilLine className="h-3 w-3 mr-1" />{ta('nlAdm.editingDraft')}</Badge>}
                </h2>
                <select
                  aria-label={ta('nlAdm.startFromATemplate')}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={e => {
                    const tpl = TEMPLATES.find(t => t.id === e.target.value)
                    if (tpl) setBody(tpl.body)
                  }}
                  defaultValue="blank"
                >
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>{ta('nlAdm.subject')}</Label>
                  <Input aria-label={ta('nlAdm.subject2')} value={subject} onChange={e => setSubject(e.target.value)} className="mt-1.5" placeholder={ta('nlAdm.whatSNewOnCodespectra')} maxLength={120} />
                </div>

                {/* Hero Image Upload */}
                <div>
                  <Label>{ta('nlAdm.heroImage')} <span className="text-muted-foreground text-xs">{ta('nlAdm.optional')}</span></Label>
                  <input ref={heroFileRef} type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
                  {heroImagePreview ? (
                    <div className="relative mt-1.5 rounded-lg overflow-hidden border">
                      <img src={heroImagePreview} alt={ta('nlAdm.hero')} className="w-full h-40 object-cover" />
                      <Button size="sm" variant="destructive" className="absolute top-2 right-2 h-7 w-7 p-0" onClick={removeHeroImage} aria-label={ta('nlAdm.removeHeroImage')}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => heroFileRef.current?.click()}
                      disabled={uploadingImage}
                      className="mt-1.5 w-full border-2 border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      {uploadingImage ? <Loader2 className="h-6 w-6 animate-spin mb-2 mx-auto" /> : <Upload className="h-6 w-6 mb-2 mx-auto" />}
                      <p className="text-sm">{uploadingImage ? 'Uploading...' : 'Click to upload a hero image'}</p>
                      <p className="text-xs mt-1">{ta('nlAdm.jpegPngGifOrWebpUp')}</p>
                    </button>
                  )}
                </div>

                <div>
                  <Label>{ta('nlAdm.introText')} <span className="text-muted-foreground text-xs">{ta('nlAdm.optional')}</span></Label>
                  <Input aria-label={ta('nlAdm.introTextOptional')} value={intro} onChange={e => setIntro(e.target.value)} className="mt-1.5" placeholder={ta('nlAdm.aBriefIntroduction')} />
                </div>

                {/* Rich Text Body */}
                <div>
                  <Label>{ta('nlAdm.body')}</Label>
                  <div className="mt-1.5">
                    <RichTextEditor value={body} onChange={setBody} placeholder={ta('nlAdm.writeYourNewsletterContentHere')} minHeight={250} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><Label>{ta('nlAdm.buttonText')}</Label><Input aria-label={ta('nlAdm.buttonText')} value={ctaText} onChange={e => setCtaText(e.target.value)} className="mt-1.5" placeholder={ta('nlAdm.readMore')} /></div>
                  <div><Label>{ta('nlAdm.buttonLink')}</Label><Input aria-label={ta('nlAdm.buttonLink')} value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} className="mt-1.5" placeholder="https://example.com" /></div>
                </div>
              </div>
            </Panel>

            {/* Channels */}
            <Panel>
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> {ta('nlAdm.deliveryChannels')}</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{ta('nlAdm.email')}</span><Badge variant="outline" className="text-[10px]">{ta('nlAdm.recipients', { recipientCount: recipientCount })}</Badge></div><Switch aria-label={ta('nlAdm.email')} checked={sendEmail} onCheckedChange={setSendEmail} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ExternalLink className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{ta('nlAdm.pushNotification')}</span></div><Switch aria-label={ta('nlAdm.pushNotification')} checked={sendPush} onCheckedChange={setSendPush} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{ta('nlAdm.inAppNotification')}</span></div><Switch aria-label={ta('nlAdm.inAppNotification')} checked={sendInApp} onCheckedChange={setSendInApp} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm">WhatsApp</span><Badge variant="outline" className="text-[10px]">OpenWA</Badge></div><Switch aria-label="WhatsApp" checked={sendWhatsapp} onCheckedChange={setSendWhatsapp} /></div>
              </div>
            </Panel>

            {/* Schedule */}
            <Panel>
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {ta('nlAdm.schedule')}</h2>
              <Label>{ta('nlAdm.scheduleForLater')} <span className="text-muted-foreground text-xs">{ta('nlAdm.leaveEmptyToSendNow')}</span></Label>
              <Input aria-label={ta('nlAdm.scheduleForLaterLeaveEmptyTo')} type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} className="mt-1.5" />
            </Panel>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => handleSend(true)} disabled={savingDraft || !subject.trim()}>{savingDraft && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{ta('nlAdm.saveDraft')}</Button>
              <Button onClick={() => handleSend(false)} disabled={sending || !subject.trim() || recipientCount === 0} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {scheduleAt ? 'Schedule' : `Send to ${recipientCount}`}
              </Button>
            </div>
          </div>

          {/* Preview & Test */}
          <div className="xl:col-span-2 space-y-6">
            <Panel>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> {ta('nlAdm.preview')}</h2>
                {previewSizeKb !== null && (
                  <Badge className={previewSizeKb > 95 ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-0' : previewSizeKb > 75 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0' : 'bg-green-500/15 text-green-700 dark:text-green-300 border-0'}>
                    <span className="tabular-nums">{previewSizeKb} KB</span> HTML {previewSizeKb > 95 ? '(Gmail clips near 102KB)' : ''}
                  </Badge>
                )}
              </div>
              <Button variant="outline" onClick={handlePreview} disabled={previewLoading} className="w-full mb-4 gap-2">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} {ta('nlAdm.generatePreview')}
              </Button>
              {previewHtml ? (
                <div className="border border-border rounded-2xl overflow-hidden"><EmailPreviewFrame html={previewHtml} /></div>
              ) : (
                <div className="border border-dashed border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">{ta('nlAdm.selectGeneratePreviewToSeeHow')}</div>
              )}
            </Panel>

            <Panel>
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> {ta('nlAdm.testSend')}</h2>
              <div className="space-y-3">
                <div><Label className="text-xs text-muted-foreground">{ta('nlAdm.email')}</Label><Input aria-label={ta('nlAdm.email')} type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="mt-1" /></div>
                <Button variant="outline" onClick={handleTestSend} disabled={testSending || !testEmail.trim()} className="w-full gap-2">
                  {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {ta('nlAdm.sendTestEmail')}
                </Button>
                <div className="border-t pt-3"><Label className="text-xs text-muted-foreground">WhatsApp</Label><Input aria-label="WhatsApp" type="tel" value={testWhatsappPhone} onChange={e => setTestWhatsappPhone(e.target.value)} placeholder="+919876543210" className="mt-1" /></div>
                <Button variant="outline" onClick={handleTestWhatsapp} disabled={testWhatsappSending || !testWhatsappPhone.trim()} className="w-full gap-2">
                  {testWhatsappSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} {ta('nlAdm.sendTestWhatsapp')}
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        /* Campaign History */
        <Panel>
          <h2 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> {ta('nlAdm.campaignHistory')}</h2>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : loadError && campaigns.length === 0 ? (
            <EmptyState illustration="error" title={ta('nlAdm.couldnTLoadCampaigns')} description={ta('nlAdm.checkYourConnectionAndTryAgain')} actionLabel={ta('nlAdm.tryAgain')} onAction={() => void load()} className="border-0 bg-transparent py-6 md:py-8" />
          ) : campaigns.length === 0 ? (
            <EmptyState variant="notifications" title={ta('nlAdm.noCampaignsYet')} description={ta('nlAdm.switchToComposeToWriteAnd')} className="border-0 bg-transparent py-6 md:py-8" />
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const s = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft
                return (
                  <div key={c.id} className="border border-border rounded-2xl p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{c.subject}</h3>
                          <Badge className={`${s.color} border-0 gap-1`}>{s.icon} {s.label}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{formatDate(c.created_at)}</span>
                          <span className="tabular-nums">{ta('nlAdm.recipients2', { recipients_count: c.recipients_count })}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs tabular-nums">
                          {c.channels.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /><span className="text-green-700 dark:text-green-400">{c.email_ok}</span>{c.email_fail > 0 && <span className="text-red-600 dark:text-red-400">/{c.email_fail}</span>}</span>}
                          {c.channels.push && <span className="flex items-center gap-1"><ExternalLink className="h-3 w-3" /><span className="text-foreground">{c.push_ok}</span></span>}
                          {c.channels.in_app && <span className="flex items-center gap-1"><Megaphone className="h-3 w-3" /><span className="text-foreground">{c.in_app_ok}</span></span>}
                          {c.channels.whatsapp && <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /><span className="text-foreground">{c.whatsapp_ok}</span></span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(c.status === 'completed' || c.status === 'sending') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={ta('nlAdm.publishToNewsroom')}
                            aria-label={ta('nlAdm.publishToNewsroom')}
                            onClick={() => void publishToBlog(c.id)}
                            className="text-primary hover:bg-primary/10"
                          >
                            <Newspaper className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(c.status === 'draft' || c.status === 'scheduled') && (
                          <Button size="sm" variant="ghost" title={ta('nlAdm.resumeEditing')} aria-label={ta('nlAdm.resumeEditing')} onClick={() => resumeDraft(c)} className="text-primary hover:bg-primary/10"><PencilLine className="h-3.5 w-3.5" /></Button>
                        )}
                        {c.status !== 'sending' && <Button size="sm" variant="ghost" onClick={() => handleDeleteCampaign(c.id)} aria-label={ta('nlAdm.deleteCampaign')} className="text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
