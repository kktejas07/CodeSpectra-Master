'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            Support Tickets
          </h1>
          <p className="text-muted-foreground mt-2">Create and manage support tickets</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border">
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
          <Card key={ticket.id} className="p-4 hover:bg-muted/30 cursor-pointer transition-colors">
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
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create Support Ticket</h2>
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
    }
  }

  const handleCreateTicket = async () => {
    if (!newTicket.title || !newTicket.description) {
      toast({
        type: 'warning',
        title: 'Missing fields',
        message: 'Please fill in title and description',
      })
      return
    }
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTicket)
      })
      if (!res.ok) throw new Error('Failed to create')
      toast({
        type: 'success',
        title: 'Ticket created',
        message: 'Your support ticket has been created successfully.',
      })
      setNewTicket({ title: '', description: '', priority: 'medium' })
      setShowCreateModal(false)
      fetchTickets()
    } catch (error) {
      console.error('[v0] Failed to create ticket:', error)
      toast({
        type: 'error',
        title: 'Failed to create ticket',
        message: String(error),
      })
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/20 text-red-700 border-red-500/30'
      case 'high': return 'bg-orange-500/20 text-orange-700 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30'
      default: return 'bg-blue-500/20 text-blue-700 border-blue-500/30'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'closed': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'in_progress': return <Loader className="w-4 h-4 text-blue-500 animate-spin" />
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const filteredTickets = tickets.filter(t => filterStatus === 'all' || t.status === filterStatus)
  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2">Support Tickets</h1>
          <p className="text-foreground/60">Get help from our support team. We typically respond within 2-4 hours.</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Create Ticket
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-foreground/60 mb-1">Total Tickets</p>
          <p className="text-2xl font-bold">{tickets.length}</p>
        </Card>
        <Card className="p-4 border-orange-500/30">
          <p className="text-sm text-foreground/60 mb-1">Open</p>
          <p className="text-2xl font-bold text-orange-600">{stats.open}</p>
        </Card>
        <Card className="p-4 border-blue-500/30">
          <p className="text-sm text-foreground/60 mb-1">In Progress</p>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </Card>
        <Card className="p-4 border-green-500/30">
          <p className="text-sm text-foreground/60 mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-600">{stats.closed}</p>
        </Card>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <Card className="p-6 border-primary/50">
          <h2 className="text-lg font-bold mb-4">Create Support Ticket</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Title</label>
              <input
                type="text"
                value={newTicket.title}
                onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                placeholder="What is the issue?"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                placeholder="Please provide detailed information..."
                className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                rows={5}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Priority</label>
              <select
                value={newTicket.priority}
                onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="low">Low - General inquiry</option>
                <option value="medium">Medium - Needs attention</option>
                <option value="high">High - Urgent issue</option>
                <option value="critical">Critical - System down</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreateTicket} className="flex-1">Create Ticket</Button>
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'open', 'in_progress', 'closed'] as const).map((status) => (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status)}
            size="sm"
          >
            {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-12 text-center">
            <p className="text-foreground/60">Loading tickets...</p>
          </Card>
        ) : filteredTickets.length === 0 ? (
          <Card className="p-12 text-center text-foreground/60">
            {filterStatus === 'all' ? 'No support tickets yet. Create one to get started.' : 'No tickets in this status.'}
          </Card>
        ) : (
          filteredTickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="p-5 hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary"
              onClick={() => router.push(`/dashboard/support/${ticket.id}`)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    {getStatusIcon(ticket.status)}
                    <h3 className="font-semibold text-lg">{ticket.title}</h3>
                  </div>
                  <p className="text-sm text-foreground/60 ml-7">{ticket.description}</p>
                </div>
                <Badge className={getPriorityColor(ticket.priority)}>
                  {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-xs text-foreground/50 ml-7">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(ticket.createdAt).toLocaleDateString()} at {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {ticket.messageCount} messages
                </span>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
