'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Users, Settings, MoreHorizontal } from 'lucide-react'

interface TeamMember {
  id: string
  email: string
  name: string
  role: 'tenant_admin' | 'user'
  joinedAt: string
  status: 'active' | 'pending'
}

export default function TeamManagement() {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'user' | 'tenant_admin'>('user')

  useEffect(() => {
    fetchTeamMembers()
  }, [])

  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/team/members')
      const data = await res.json()
      setMembers(data)
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail) return
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      })
      if (res.ok) {
        setInviteEmail('')
        setShowInviteModal(false)
        fetchTeamMembers()
      }
    } catch (error) {
      console.error('Failed to invite member:', error)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return
    try {
      await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' })
      fetchTeamMembers()
    } catch (error) {
      console.error('Failed to remove member:', error)
    }
  }

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      await fetch(`/api/team/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      fetchTeamMembers()
    } catch (error) {
      console.error('Failed to update role:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage team members and their roles</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {showInviteModal && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Invite Team Member</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'user' | 'tenant_admin')}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="user">User</option>
                <option value="tenant_admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleInvite} className="flex-1">Send Invite</Button>
              <Button variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <Card className="p-6 text-center">Loading team members...</Card>
        ) : members.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No team members yet</Card>
        ) : (
          members.map((member) => (
            <Card key={member.id} className="p-6 flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{member.name}</h3>
                <p className="text-sm text-muted-foreground">{member.email}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                    {member.status}
                  </Badge>
                  <Badge variant="outline">{member.role}</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleChangeRole(member.id, e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="user">User</option>
                  <option value="tenant_admin">Admin</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMember(member.id)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
