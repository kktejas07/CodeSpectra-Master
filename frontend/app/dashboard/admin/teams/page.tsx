'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function TeamsManagement() {
  const [teams] = useState([
    { id: 1, name: 'Backend Team', members: 5, admin: 'John Doe', status: 'active' },
    { id: 2, name: 'Frontend Team', members: 3, admin: 'Jane Smith', status: 'active' },
    { id: 3, name: 'DevOps Team', members: 2, admin: 'Mike Johnson', status: 'active' },
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teams Management</h1>
          <p className="text-muted-foreground mt-1">Manage organization teams</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Create Team
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Teams</p>
          <p className="text-3xl font-bold mt-2">{teams.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Members</p>
          <p className="text-3xl font-bold mt-2">{teams.reduce((acc, t) => acc + t.members, 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active Teams</p>
          <p className="text-3xl font-bold mt-2">{teams.filter(t => t.status === 'active').length}</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search teams..." className="pl-9" />
          </div>
        </div>

        <div className="space-y-4">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center justify-between p-4 border border-border/40 rounded-lg hover:bg-muted/50 transition-colors">
              <div>
                <h3 className="font-medium">{team.name}</h3>
                <p className="text-sm text-muted-foreground">Admin: {team.admin} • {team.members} members</p>
              </div>
              <Button variant="outline" size="sm">Edit</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
