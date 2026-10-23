'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useCallback, useEffect, useState } from 'react'
import { Plus, MessageSquare, ArrowLeft, Send, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/toast-context'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'
import { SupportAssistant } from '@/components/support/support-assistant'

type Ticket = { id: string; subject: string; message: string; category: string; status: string; user_email?: string; created_at: string; updated_at: string }

export default function SupportPage() {
  const { formatDateTime, formatDate } = useLocaleDates()
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<{ id: string; message: string; user_email: string; created_at: string }[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  // W4-10: role from the auth context (same on server and client), not document.cookie in render.
  const isAdmin = gate.user?.role === 'superadmin' || gate.user?.role === 'tenant_admin'

  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('general')

  const [loadError, setLoadError] = useState(false)

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets', { credentials: 'include' })
      if (!res.ok) throw new Error(tr('account.failedToLoadTicketsStatus', { status: res.status }))
      const json = await res.json()
      setTickets(json.tickets || [])
      setLoadError(false)
    } catch { setLoadError(true) }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const supportTour: TourStep[] = [
        {
          target: '[data-tour="support-header"]',
          title: tr('account.supportTicketsOverview'),
          description: tr('account.yourPlaceToRaiseHelpRequestsf68'),
          position: 'bottom',
        },
        {
          target: '[data-tour="support-new"]',
          title: tr('account.createSupportTicket'),
          description: tr('account.startATicketWithASubjectab8'),
          position: 'bottom',
        },
        {
          target: '[data-tour="support-list"]',
          title: tr('account.followUpFaster'),
          description: tr('account.tipClickATicketToOpencde'),
          position: 'top',
        },
      ]
      autoPlayPageTour('support', supportTour)}
  }, [gate.ready, startTour, setTourSeen])

  const openTicket = async (t: Ticket) => {
    setSelectedTicket(t)
    setNewMessage('')
    try {
      const res = await fetch(`/api/support/tickets/${t.id}`, { credentials: 'include' })
      const json = await res.json()
      setReplies(json.replies || [])
    } catch { setReplies([]) }
  }

  const sendReply = async () => {
    if (!newMessage.trim() || !selectedTicket) return
    setSending(true)
    try {
      const res = await csrfFetch(`/api/support/tickets/${selectedTicket.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage }),
      })
      if (res.ok) {
        setNewMessage('')
        const json = await res.json()
        setReplies(prev => [...prev, json.reply])
        addToast({ type: 'success', title: tr('account.replySent') })
      }
    } catch { addToast({ type: 'error', title: tr('account.failedToSend') }) }
    finally { setSending(false) }
  }

  const createTicket = async () => {
    if (!subject.trim() || !message.trim()) return
    try {
      await csrfFetch('/api/support/tickets', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category }),
      })
      setShowForm(false)
      setSubject(''); setMessage(''); setCategory('general')
      addToast({ type: 'success', title: tr('account.ticketCreated') })
      fetchTickets()
    } catch { addToast({ type: 'error', title: tr('account.failedToCreateTicket') }) }
  }

  const closeTicket = async (ticketId: string) => {
    await csrfFetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    addToast({ type: 'success', title: tr('account.ticketClosed') })
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t))
    if (selectedTicket?.id === ticketId) setSelectedTicket(prev => prev ? { ...prev, status: 'closed' } : null)
  }

  const statusColor = (s: string) => s === 'open' ? 'bg-green-500/15 text-green-700 capitalize dark:text-green-400' : 'bg-muted text-muted-foreground capitalize'

  if (!gate.ready) return null

  if (selectedTicket) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedTicket(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{' '}{tr('account.backToTickets')}</button>
        <Card className="rounded-3xl border-border/70 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground">{selectedTicket.subject}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={statusColor(selectedTicket.status)}>{selectedTicket.status}</Badge>
                <span className="text-xs text-muted-foreground">{selectedTicket.user_email}</span>
              </div>
            </div>
            {selectedTicket.status !== 'closed' && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => closeTicket(selectedTicket.id)}>
                <XCircle className="h-3.5 w-3.5 mr-1" />{' '}{tr('common.close')}</Button>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{selectedTicket.message}</p>
        </Card>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-foreground">{tr('account.repliesCount', { count: replies.length })}</h3>
          {replies.map(r => (
            <Card key={r.id} className="rounded-2xl border-border/70 p-4">
              <p className="text-xs text-muted-foreground mb-1">{r.user_email} · {formatDateTime(r.created_at)}</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{r.message}</p>
            </Card>
          ))}
        </div>

        {selectedTicket.status !== 'closed' && (
          <div className="flex gap-2">
            <Input aria-label={tr('account.reply')} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={tr('account.typeYourReply')} onKeyDown={e => e.key === 'Enter' && sendReply()} />
            <Button onClick={sendReply} disabled={sending || !newMessage.trim()} title={tr('account.send')} aria-label={tr('account.sendReply')}><Send className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div data-tour="support-header">
        <PageHeader
          illustration="inbox"
          className="mb-0"
          icon={<MessageSquare aria-hidden />}
          title={tr('account.supportTickets')}
          description={<>{tr('account.askForHelpAndFollowReplies2a5')}{' '}<span className="tabular-nums">{tickets.length}</span>{' '}{tr('account.tickets', { count: tickets.length })}</>}
          actions={<Button onClick={() => setShowForm(true)} data-tour="support-new"><Plus className="h-4 w-4 mr-2" />{tr('account.newTicket')}</Button>}
        />
      </div>

      <SupportAssistant onTicketCreated={fetchTickets} />

      {showForm && (
        <Card className="rounded-3xl border-border/70 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ticket-subject">{tr('account.subject')}</Label>
              <Input id="ticket-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder={tr('account.briefSummaryOfYourIssue')} />
            </div>
            <div>
              <Label htmlFor="ticket-category">{tr('account.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="ticket-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{tr('account.general')}</SelectItem>
                  <SelectItem value="billing">{tr('account.billing')}</SelectItem>
                  <SelectItem value="technical">{tr('account.technical')}</SelectItem>
                  <SelectItem value="bug">{tr('account.bugReport')}</SelectItem>
                  <SelectItem value="feature">{tr('account.featureRequest')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="ticket-message">{tr('account.message')}</Label>
            <Textarea id="ticket-message" value={message} onChange={e => setMessage(e.target.value)} placeholder={tr('account.describeYourIssueInDetail')} rows={4} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTicket} disabled={!subject.trim() || !message.trim()}>{tr('common.submit')}</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>{tr('common.cancel')}</Button>
          </div>
        </Card>
      )}

      <div data-tour="support-list">
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        : loadError && tickets.length === 0 ? <EmptyState illustration="error" title={tr('account.couldntLoadYourTickets')} description={tr('account.checkYourConnectionAndTryAgain')} actionLabel={tr('common.tryAgain')} onAction={() => { setLoading(true); void fetchTickets() }} />
        : tickets.length === 0 ? <EmptyState illustration="inbox" variant="notifications" title={tr('account.noTicketsYet')} description={tr('account.useNewTicketToAskAc66')} />
        : <div className="space-y-3">
          {tickets.map(t => (
            <Card role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }} key={t.id} className="cursor-pointer rounded-2xl border-border/70 p-4 transition-colors duration-200 hover:border-primary/30 hover:bg-muted/30" onClick={() => openTicket(t)}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="capitalize">{t.category}</Badge>
                    {t.user_email && <span className="text-xs text-muted-foreground">{t.user_email}</span>}
                    <span className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-0.5" />{formatDate(t.created_at)}</span>
                  </div>
                </div>
                <Badge className={statusColor(t.status)}>{t.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      }
      </div>
    </div>
  )
}
