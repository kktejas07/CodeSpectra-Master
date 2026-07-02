'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Plus, Edit, Trash2, Eye } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface Codeathon {
  id: string
  title: string
  startDate: string
  endDate: string
  prizePool: string
  participants: number
  difficulty: string
  status: 'upcoming' | 'ongoing' | 'ended'
}

export default function AdminCodeathonsPage() {
  const gate = usePageGuard('superadmin')

  const [codeathons, setCodeathons] = useState<Codeathon[]>([
    {
      id: '1',
      title: 'Web Development Challenge 2024',
      startDate: '2024-05-01',
      endDate: '2024-05-31',
      prizePool: '$5,000',
      participants: 342,
      difficulty: 'Intermediate',
      status: 'upcoming',
    },
    {
      id: '2',
      title: 'AI/ML Hackathon',
      startDate: '2024-04-20',
      endDate: '2024-04-22',
      prizePool: '$10,000',
      participants: 128,
      difficulty: 'Advanced',
      status: 'ongoing',
    },
  ])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newCodeathon, setNewCodeathon] = useState({ title: '', startDate: '', endDate: '' })

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const handleCreateCodeathon = (e: React.FormEvent) => {
    e.preventDefault()
    const codeathon: Codeathon = {
      id: String(codeathons.length + 1),
      ...newCodeathon,
      prizePool: '$0',
      participants: 0,
      difficulty: 'Intermediate',
      status: 'upcoming',
    }
    setCodeathons([codeathon, ...codeathons])
    setNewCodeathon({ title: '', startDate: '', endDate: '' })
    setShowCreateModal(false)
  }

  const handleDelete = (id: string) => {
    setCodeathons(codeathons.filter(c => c.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-500/20 text-blue-700'
      case 'ongoing':
        return 'bg-green-500/20 text-green-700'
      case 'ended':
        return 'bg-gray-500/20 text-gray-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-8 h-8 text-primary" />
            Codeathon Management
          </h1>
          <p className="text-muted-foreground mt-2">Manage coding competitions and hackathons</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Codeathon
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Events</p>
          <p className="text-3xl font-bold text-foreground">{codeathons.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Ongoing</p>
          <p className="text-3xl font-bold text-green-600">{codeathons.filter(c => c.status === 'ongoing').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Participants</p>
          <p className="text-3xl font-bold text-primary">{codeathons.reduce((sum, c) => sum + c.participants, 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Prize Pool</p>
          <p className="text-3xl font-bold text-blue-600">${codeathons.reduce((sum, c) => {
            const amount = parseInt(c.prizePool.replace(/[$,]/g, ''))
            return sum + (isNaN(amount) ? 0 : amount)
          }, 0).toLocaleString()}</p>
        </Card>
      </div>

      {/* Codeathons Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Title</th>
                <th className="px-6 py-3 text-left font-semibold">Duration</th>
                <th className="px-6 py-3 text-left font-semibold">Prize Pool</th>
                <th className="px-6 py-3 text-left font-semibold">Participants</th>
                <th className="px-6 py-3 text-left font-semibold">Difficulty</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codeathons.map((codeathon) => (
                <tr key={codeathon.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{codeathon.title}</td>
                  <td className="px-6 py-3 text-xs">
                    {codeathon.startDate} → {codeathon.endDate}
                  </td>
                  <td className="px-6 py-3 font-semibold">{codeathon.prizePool}</td>
                  <td className="px-6 py-3">{codeathon.participants}</td>
                  <td className="px-6 py-3">{codeathon.difficulty}</td>
                  <td className="px-6 py-3">
                    <Badge className={getStatusColor(codeathon.status)}>
                      {codeathon.status.charAt(0).toUpperCase() + codeathon.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(codeathon.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Codeathon Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Create New Codeathon</h2>
            <form onSubmit={handleCreateCodeathon} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Event Title</label>
                <input
                  type="text"
                  value={newCodeathon.title}
                  onChange={(e) => setNewCodeathon({ ...newCodeathon, title: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
                <input
                  type="date"
                  value={newCodeathon.startDate}
                  onChange={(e) => setNewCodeathon({ ...newCodeathon, startDate: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
                <input
                  type="date"
                  value={newCodeathon.endDate}
                  onChange={(e) => setNewCodeathon({ ...newCodeathon, endDate: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Create Event
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
