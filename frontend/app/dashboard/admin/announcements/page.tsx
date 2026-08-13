'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, Megaphone, Send, Eye, Clock, Users as UsersIcon,
  Shield, CheckCircle, Upload, X, MessageCircle, ExternalLink, Bell
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { RichTextEditor } from '@/components/ui/rich-text-editor'

interface Announcement {
  id: string; title: string; message: string; link?: string; image?: string
  user_id: string; created_at: string; is_read?: boolean
  channels?: { email?: boolean; push?: boolean; in_app?: boolean; whatsapp?: boolean }
}

export default function AnnouncementsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const imageFileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    title: '', message: '', link: '', image: '',
    target: 'all' as 'all' | 'user' | 'tenant_admin' | 'superadmin',
    send_email: true, send_push: true, send_in_app: true, send_whatsapp: false,
    schedule_at: '',
  })
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [history, setHistory] = useState<Announcement[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose')

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await csrfFetch('/api/upload', { method: 'POST', credentials: 'include', body: formData })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      setForm(f => ({ ...f, image: data.url }))
      addToast({ type: 'success', title: 'Image uploaded' })
    } catch { addToast({ type: 'error', title: 'Upload failed' }) }
    finally { setUploadingImage(false); if (imageFileRef.current) imageFileRef.current.value = '' }
  }

  const send = async () => {
    if (!form.title.trim() || !form.message.trim()) { addToast({ type: 'error', title: 'Title and message are required' }); return }
    setSending(true)
    try {
      const res = await csrfFetch('/api/admin/announcements', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.error) { addToast({ type: 'error', title: data.error }); return }
      addToast({ type: 'success', title: `Announcement sent to ${data.sent} users` })
      setForm({ title: '', message: '', link: '', image: '', target: 'all', send_email: true, send_push: true, send_in_app: true, send_whatsapp: false, schedule_at: '' })
      setActiveTab('history')
      await loadHistory()
    } catch { addToast({ type: 'error', title: 'Failed to send' }) }
    finally { setSending(false) }
  }

  const targetOptions: { value: typeof form.target; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'All Users', desc: 'Every registered user', icon: <UsersIcon className="h-4 w-4" /> },
    { value: 'user', label: 'Regular Users', desc: 'Standard accounts only', icon: <UsersIcon className="h-4 w-4" /> },
    { value: 'tenant_admin', label: 'Org Admins', desc: 'Organization admins', icon: <Shield className="h-4 w-4" /> },
    { value: 'superadmin', label: 'Admins', desc: 'Superadmin accounts', icon: <Shield className="h-4 w-4" /> },
  ]

  if (!gate.ready) {
    return <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center"><Megaphone className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-sm text-muted-foreground">Broadcast notifications across channels</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={activeTab === 'compose' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('compose')}><Send className="h-4 w-4 mr-1" /> Compose</Button>
          <Button variant={activeTab === 'history' ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab('history')}><Clock className="h-4 w-4 mr-1" /> History ({historyTotal})</Button>
        </div>
      </div>

      {activeTab === 'compose' ? (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 space-y-6">
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Send className="h-4 w-4" /> New Announcement</h2>
              <div className="space-y-4">
                <div>
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1.5" placeholder="Platform maintenance scheduled" maxLength={100} />
                  <p className="text-xs text-muted-foreground mt-1">{form.title.length}/100</p>
                </div>

                {/* Image Upload */}
                <div>
                  <Label>Image <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  {form.image ? (
                    <div className="relative mt-1.5 rounded-lg overflow-hidden border">
                      <img src={form.image} alt="" className="w-full h-32 object-cover" />
                      <Button size="sm" variant="destructive" className="absolute top-2 right-2 h-7 w-7 p-0" onClick={() => setForm(f => ({ ...f, image: '' }))}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => imageFileRef.current?.click()} disabled={uploadingImage}
                      className="mt-1.5 w-full border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground hover:border-primary/50 transition-colors">
                      {uploadingImage ? <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" /> : <Upload className="h-5 w-5 mx-auto mb-1" />}
                      <p className="text-xs">{uploadingImage ? 'Uploading...' : 'Click to upload image'}</p>
                    </button>
                  )}
                </div>

                <div>
                  <Label>Message *</Label>
                  <div className="mt-1.5">
                    <RichTextEditor value={form.message} onChange={msg => setForm(f => ({ ...f, message: msg }))} placeholder="Write your announcement..." minHeight={150} />
                  </div>
                </div>

                <div>
                  <Label>Link <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} className="mt-1.5" placeholder="https://codespectra.ai/blog/update" type="url" />
                </div>

                <div>
                  <Label>Send to</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    {targetOptions.map(opt => (
                      <button key={opt.value} onClick={() => setForm(f => ({ ...f, target: opt.value }))}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors ${form.target === opt.value ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/30'}`}>
                        <span className="mt-0.5 text-muted-foreground">{opt.icon}</span>
                        <div><p className="text-sm font-medium">{opt.label}</p><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                        {form.target === opt.value && <CheckCircle className="h-4 w-4 text-primary ml-auto mt-0.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Channels */}
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Bell className="h-4 w-4" /> Delivery Channels</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">In-App Notification</span></div><Switch checked={form.send_in_app} onCheckedChange={v => setForm(f => ({ ...f, send_in_app: v }))} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Email</span></div><Switch checked={form.send_email} onCheckedChange={v => setForm(f => ({ ...f, send_email: v }))} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ExternalLink className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Push Notification</span></div><Switch checked={form.send_push} onCheckedChange={v => setForm(f => ({ ...f, send_push: v }))} /></div>
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-muted-foreground" /><span className="text-sm">WhatsApp</span></div><Switch checked={form.send_whatsapp} onCheckedChange={v => setForm(f => ({ ...f, send_whatsapp: v }))} /></div>
              </div>
            </Card>

            {/* Schedule */}
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule</h2>
              <Label>Schedule for later <span className="text-muted-foreground text-xs">(leave empty to send now)</span></Label>
              <Input type="datetime-local" value={form.schedule_at} onChange={e => setForm(f => ({ ...f, schedule_at: e.target.value }))} className="mt-1.5" />
            </Card>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(p => !p)} className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Preview</Button>
              <Button onClick={send} disabled={sending || !form.title.trim() || !form.message.trim()} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {targetOptions.find(o => o.value === form.target)?.label}
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="xl:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</h2>
              <div className="bg-muted/40 rounded-lg p-4 border border-border/60">
                {form.image && <img src={form.image} alt="" className="w-full h-24 object-cover rounded mb-3" />}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0"><Megaphone className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="font-semibold text-sm">{form.title || '(no title)'}</p>
                    <div className="text-xs text-muted-foreground mt-1 prose prose-xs max-w-none" dangerouslySetInnerHTML={{ __html: form.message || '<p>(no message)</p>' }} />
                    {form.link && <p className="text-xs text-primary mt-1">{form.link}</p>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {form.send_in_app && <Badge variant="outline" className="text-[10px]"><Megaphone className="h-2.5 w-2.5 mr-0.5" /> In-App</Badge>}
                {form.send_email && <Badge variant="outline" className="text-[10px]"><Mail className="h-2.5 w-2.5 mr-0.5" /> Email</Badge>}
                {form.send_push && <Badge variant="outline" className="text-[10px]"><ExternalLink className="h-2.5 w-2.5 mr-0.5" /> Push</Badge>}
                {form.send_whatsapp && <Badge variant="outline" className="text-[10px]"><MessageCircle className="h-2.5 w-2.5 mr-0.5" /> WhatsApp</Badge>}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* History */
        <Card className="p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Clock className="h-4 w-4" /> Sent Announcements ({historyTotal})</h2>
          {loadingHistory ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No announcements sent yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map(ann => (
                <div key={ann.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start gap-3">
                    {ann.image && <img src={ann.image} alt="" className="w-16 h-16 object-cover rounded shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{ann.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2" dangerouslySetInnerHTML={{ __html: ann.message }} />
                      {ann.link && <a href={ann.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">{ann.link}</a>}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>{new Date(ann.created_at).toLocaleDateString()}</span>
                        {ann.channels?.in_app && <Badge variant="outline" className="text-[9px]">In-App</Badge>}
                        {ann.channels?.email && <Badge variant="outline" className="text-[9px]">Email</Badge>}
                        {ann.channels?.push && <Badge variant="outline" className="text-[9px]">Push</Badge>}
                        {ann.channels?.whatsapp && <Badge variant="outline" className="text-[9px]">WhatsApp</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Mail(props: React.SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
}
