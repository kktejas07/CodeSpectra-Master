'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { TeamMemberCard } from '@/components/admin/team-member-card'

export default function TeamManagement() {
  const [members, setMembers] = useState([
    {
      id: '1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'tenant_admin' as const,
      joinedAt: 'Jan 15, 2024',
      status: 'active' as const,
    },
    {
      id: '2',
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'member' as const,
      joinedAt: 'Feb 1, 2024',
      status: 'active' as const,
    },
    {
      id: '3',
      name: 'Carol Davis',
      email: 'carol@example.com',
      role: 'member' as const,
      joinedAt: 'Mar 10, 2024',
      status: 'inactive' as const,
    },
  ])

  return (
    <div className="space-y-6">
      <TeamMemberCard
        members={members}
        onAddMember={() => console.log('Add member')}
        onRemoveMember={(id) => setMembers(members.filter(m => m.id !== id))}
        onChangeRole={(id, role) => console.log('Change role:', id, role)}
      />
    </div>
  )
}
