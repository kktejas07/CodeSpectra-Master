'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, Mail, Shield, MoreVertical, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TeamMember {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  joinedAt: string
  status: 'active' | 'inactive'
  avatar?: string
}

interface TeamMemberCardProps {
  members?: TeamMember[]
  onAddMember?: () => void
  onRemoveMember?: (memberId: string) => void
  onChangeRole?: (memberId: string, newRole: string) => void
}

export function TeamMemberCard({
  members = [
    {
      id: '1',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'admin',
      joinedAt: 'Jan 15, 2024',
      status: 'active',
    },
    {
      id: '2',
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'member',
      joinedAt: 'Feb 1, 2024',
      status: 'active',
    },
    {
      id: '3',
      name: 'Carol Davis',
      email: 'carol@example.com',
      role: 'member',
      joinedAt: 'Mar 10, 2024',
      status: 'inactive',
    },
  ],
  onAddMember,
  onRemoveMember,
  onChangeRole,
}: TeamMemberCardProps) {
  const getRoleColor = (role: string) => {
    return role === 'admin'
      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
      : 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
  }

  const getStatusColor = (status: string) => {
    return status === 'active'
      ? 'bg-green-500/20 text-green-700 dark:text-green-400'
      : 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Team Members ({members.length})
        </h2>
        <Button onClick={onAddMember} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Member
        </Button>
      </div>

      <div className="grid gap-4">
        {members.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4 flex-1">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">
                    {member.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{member.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Mail className="w-3 h-3" />
                    {member.email}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Joined {member.joinedAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={getRoleColor(member.role)}>
                  {(member.role || 'user').charAt(0).toUpperCase() + (member.role || 'user').slice(1)}
                </Badge>
                <Badge className={getStatusColor(member.status)}>
                  {member.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onChangeRole?.(member.id, member.role === 'admin' ? 'member' : 'admin')}>
                      <Shield className="w-4 h-4 mr-2" />
                      Change to {member.role === 'admin' ? 'Member' : 'Admin'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRemoveMember?.(member.id)} className="text-red-600 dark:text-red-400">
                      Remove from Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
