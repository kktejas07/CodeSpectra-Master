'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, MessageSquare, ArrowLeft, Send, Clock, CheckCircle2 } from 'lucide-react'

type Ticket = { id: string; subject: string; message: string; category: string; status: string; created_at: string; updated_at: string }

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<{ id: string; message: string; user_email: string; created_at: string }[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)

  // New ticket form
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('general')

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets')
      const json = await res.json()
      setTickets(json.tickets || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  const openTicket = async (t: Ticket) => {
    setSelectedTicket(t)
    setNewMessage('')
    try {
      const res = await fetch(`/api/support/tickets/${t.id}`)
      const json = await res.json()
      setReplies(json.replies || [])
    } catch { setReplies([]) }
  }

  const sendReply = async () => {
    if (!newMessage.trim() || !selectedTicket) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage }),
      })
      if (res.ok) {
        setNewMessage('')
        const json = await res.json()
        setReplies((p) => [...p, json.reply])
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, category }),
      })
      if (res.ok) {
        setShowForm(false)
        setSubject('')
        setMessage('')
        fetchTickets()
      }
    } catch { /* ignore */ }
  }

  const statusBadge = (s: string) => {
    if (s === 'open') return <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-500"><Clock className="h-2.5 w-2.5" /> Open</span>
    if (s === 'in_progress') return <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-500">In Progress</span>
    return <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"><CheckCircle2 className="h-2.5 w-2.5" /> Closed</span>
  }

  if (selectedTicket) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <button onClick={() => setSelectedTicket(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Back</button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{selectedTicket.subject}</h2>
            <p className="text-xs text-muted-foreground">{selectedTicket.category} · {new Date(selectedTicket.created_at).toLocaleDateString()}</p>
          </div>
          {statusBadge(selectedTicket.status)}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm">{selectedTicket.message}</div>
        <div className="space-y-3">
          {replies.map((r) => (
            <div key={r.id} className={`rounded-lg border p-3 text-sm ${(r as any).user_email === (selectedTicket as any).user_email ? 'border-border bg-card' : 'border-primary/20 bg-primary/5'}`}>
              <p className="text-xs text-muted-foreground">{r.user_email} · {new Date(r.created_at).toLocaleString()}</p>
              <p className="mt-1">{r.message}</p>
            </div>
          ))}
        </div>
        {selectedTicket.status !== 'closed' && (
          <div className="flex gap-2">
            <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={2} className="flex-1 rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Type your reply..." />
            <button onClick={sendReply} disabled={sending || !newMessage.trim()} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {sending ? 'Sending...' : 'Send'}</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card"><MessageSquare className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-2xl font-bold">Support Tickets</h1><p className="text-sm text-muted-foreground">Get help from the team</p></div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> {showForm ? 'Cancel' : 'New Ticket'}</button>
      </div>

      {showForm && (
        <form onSubmit={createTicket} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div><label className="text-sm font-medium">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Brief description" /></div>
          <div><label className="text-sm font-medium">Category</label><select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="general">General</option><option value="billing">Billing</option><option value="technical">Technical</option><option value="feature">Feature Request</option></select></div>
          <div><label className="text-sm font-medium">Message</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Describe your issue in detail..." /></div>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Submit Ticket</button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No support tickets. Create one to get help.</div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openTicket(t)} className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/30">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground truncate">{t.category} · {new Date(t.created_at).toLocaleDateString()}</p>
              </div>
              {statusBadge(t.status)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
