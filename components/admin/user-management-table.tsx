'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Users, Search, Edit2, Trash2, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface User {
  id: string
  name: string
  email: string
  role: 'superadmin' | 'admin' | 'user'
  status: 'active' | 'inactive'
  joinedAt: string
  lastActive: string
}

interface UserManagementTableProps {
  users?: User[]
  onEdit?: (user: User) => void
  onDelete?: (userId: string) => void
  onRoleChange?: (userId: string, newRole: string) => void
}

export function UserManagementTable({ 
  users = [],
  onEdit,
  onDelete,
  onRoleChange,
}: UserManagementTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      case 'admin':
        return 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
      case 'user':
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
      default:
        return 'bg-gray-500/20 text-gray-700'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 rounded-lg bg-background border border-border text-foreground text-sm"
        >
          <option value="all">All Roles</option>
          <option value="superadmin">Superadmin</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left py-3 px-4 font-semibold">User</th>
                <th className="text-left py-3 px-4 font-semibold">Email</th>
                <th className="text-left py-3 px-4 font-semibold">Role</th>
                <th className="text-left py-3 px-4 font-semibold">Status</th>
                <th className="text-left py-3 px-4 font-semibold">Joined</th>
                <th className="text-left py-3 px-4 font-semibold">Last Active</th>
                <th className="text-right py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-medium">{user.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                    <td className="py-3 px-4">
                      <Badge className={getRoleColor(user.role)}>
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={user.status === 'active' 
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400' 
                        : 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
                      }>
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{user.joinedAt}</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{user.lastActive}</td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit?.(user)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete?.(user.id)}
                            className="text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredUsers.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {users.length} users
        </div>
      )}
    </div>
  )
}
