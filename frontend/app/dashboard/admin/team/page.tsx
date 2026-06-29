'use client'

import { useEffect, useState } from 'react'
import { Loader, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  joinedAt: string
  status: string
}

export default function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/teams/members')
      .then(r => r.json())
      .then(json => { if (json.data) setMembers(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  if (members.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Team Members</h1>
        <Card className="border-border/60 p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No team members yet.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Team Members</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(m => (
          <Card key={m.id} className="border-border/60 p-5">
            <h3 className="font-semibold text-foreground">{m.name}</h3>
            <p className="text-xs text-muted-foreground">{m.email}</p>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="capitalize">{m.role.replace('_', ' ')}</span>
              <span>Joined: {m.joinedAt}</span>
              <span className={m.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>{m.status}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
