'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header'
import { Plus, MessageSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react'

interface Ticket {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'closed'
  createdAt: string
  updatedAt: string
  messageCount: number
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([
    {
      id: 'TKT-001',
      title: 'Code scanner not working',
      description: 'Getting an error when trying to scan code',
      priority: 'high',
      status: 'in_progress',
      createdAt: '2024-04-15',
      updatedAt: '2024-04-17',
      messageCount: 3,
    },
    {
      id: 'TKT-002',
      title: 'Integration setup help',
      description: 'Need help setting up GitHub integration',
      priority: 'medium',
      status: 'open',
      createdAt: '2024-04-16',
      updatedAt: '2024-04-16',
      messageCount: 1,
    },
    {
      id: 'TKT-003',
      title: 'Feature request: Dark mode',
      description: 'Would love to see dark mode support',
      priority: 'low',
      status: 'closed',
      createdAt: '2024-04-10',
      updatedAt: '2024-04-14',
      messageCount: 5,
    },
  ])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all')
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium' })

  const filteredTickets = filterStatus === 'all' ? tickets : tickets.filter(t => t.status === filterStatus)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4 text-orange-500" />
      case 'in_progress':
        return <Clock className="w-4 h-4 text-blue-500" />
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      default:
        return null
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 text-red-700'
      case 'high':
        return 'bg-orange-500/20 text-orange-700'
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-700'
      case 'low':
        return 'bg-green-500/20 text-green-700'
      default:
        return ''
    }
  }

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    const ticket: Ticket = {
      id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
      ...newTicket,
      priority: newTicket.priority as Ticket['priority'],
      status: 'open',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      messageCount: 0,
    }
    setTickets([ticket, ...tickets])
    setNewTicket({ title: '', description: '', priority: 'medium' })
    setShowCreateModal(false)
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        icon={MessageSquare}
        title="Support tickets"
        description="Create tickets, track status, and follow up with the team."
        actions={
          <Button onClick={() => setShowCreateModal(true)} className="gap-2 rounded-lg">
            <Plus className="h-4 w-4" />
            New ticket
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border/60">
        {(['all', 'open', 'in_progress', 'closed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              filterStatus === status
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground/60 hover:text-foreground'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {filteredTickets.map((ticket) => (
          <Card
            key={ticket.id}
            className="cursor-pointer rounded-xl border-border/60 p-4 shadow-sm transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {getStatusIcon(ticket.status)}
                  <h3 className="font-semibold text-foreground">{ticket.title}</h3>
                  <Badge className={getPriorityColor(ticket.priority)}>{ticket.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{ticket.description}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>ID: {ticket.id}</span>
                  <span>Created: {ticket.createdAt}</span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {ticket.messageCount} messages
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm">
                View
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md rounded-xl border-border/60 p-6 shadow-lg">
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">Create support ticket</h2>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground h-24 resize-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Priority</label>
                <select
                  value={newTicket.priority}
                  onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Create Ticket
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
