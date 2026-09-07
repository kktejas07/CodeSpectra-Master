'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, MessageSquare, ArrowLeft, Send, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/toast-context'

type Ticket = { id: string; subject: string; message: string; category: string; status: string; user_email?: string; created_at: string; updated_at: string }

export default function SupportPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const addToast = useToast()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<{ id: string; message: string; user_email: string; created_at: string }[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isAdmin] = useState(typeof window !== 'undefined' && (document.cookie.includes('role=superadmin') || document.cookie.includes('role=tenant_admin')))

  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('general')

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets', { credentials: 'include' })
      const json = await res.json()
      setTickets(json.tickets || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_support_tour')) {
      const supportTour: TourStep[] = [
        {
          target: '[data-tour="support-header"]',
          title: 'Support tickets',
          description: 'Track every help request you raise — replies from the team land here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="support-new"]',
          title: 'Raise a ticket',
          description: 'Click New Ticket, pick a category, and describe your issue.',
          position: 'bottom',
        },
        {
          target: '[data-tour="support-list"]',
          title: 'Follow conversations',
          description: 'Click any ticket to read replies and respond until it is resolved.',
          position: 'top',
        },
      ]
      startTour(supportTour, 'support')
      setTourSeen('support')
    }
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
        addToast({ type: 'success', title: 'Reply sent' })
      }
    } catch { addToast({ type: 'error', title: 'Failed to send' }) }
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
      addToast({ type: 'success', title: 'Ticket created' })
      fetchTickets()
    } catch { addToast({ type: 'error', title: 'Failed to create ticket' }) }
  }

  const closeTicket = async (ticketId: string) => {
    await csrfFetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    addToast({ type: 'success', title: 'Ticket closed' })
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'closed' } : t))
    if (selectedTicket?.id === ticketId) setSelectedTicket(prev => prev ? { ...prev, status: 'closed' } : null)
  }

  const statusColor = (s: string) => s === 'open' ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'

  if (!gate.ready) return null

  if (selectedTicket) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <button onClick={() => setSelectedTicket(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to tickets
        </button>
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{selectedTicket.subject}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={statusColor(selectedTicket.status)}>{selectedTicket.status}</Badge>
                <span className="text-xs text-muted-foreground">{selectedTicket.user_email}</span>
              </div>
            </div>
            {selectedTicket.status !== 'closed' && (
              <Button variant="outline" size="sm" className="text-red-500" onClick={() => closeTicket(selectedTicket.id)}>
                <XCircle className="h-3.5 w-3.5 mr-1" /> Close
              </Button>
            )}
          </div>
          <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{selectedTicket.message}</p>
        </Card>

        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Replies ({replies.length})</h3>
          {replies.map(r => (
            <Card key={r.id} className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{r.user_email} · {new Date(r.created_at).toLocaleString()}</p>
              <p className="text-sm whitespace-pre-wrap">{r.message}</p>
            </Card>
          ))}
        </div>

        {selectedTicket.status !== 'closed' && (
          <div className="flex gap-2">
            <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type your reply..." onKeyDown={e => e.key === 'Enter' && sendReply()} />
            <Button onClick={sendReply} disabled={sending || !newMessage.trim()} title="Send"><Send className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between" data-tour="support-header">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2"><MessageSquare className="h-8 w-8 text-primary" />Support Tickets</h1>
          <p className="text-muted-foreground text-sm mt-1">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-tour="support-new"><Plus className="h-4 w-4 mr-2" />New Ticket</Button>
      </div>

      {showForm && (
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief summary of your issue" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your issue in detail" rows={4} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTicket} disabled={!subject.trim() || !message.trim()}>Submit</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div data-tour="support-list">
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        : tickets.length === 0 ? <Card className="p-8 text-center text-muted-foreground">No tickets yet.</Card>
        : <div className="space-y-3">
          {tickets.map(t => (
            <Card key={t.id} className="p-4 hover:bg-muted/30 cursor-pointer" onClick={() => openTicket(t)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{t.category}</Badge>
                    {t.user_email && <span className="text-xs text-muted-foreground">{t.user_email}</span>}
                    <span className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-0.5" />{new Date(t.created_at).toLocaleDateString()}</span>
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
