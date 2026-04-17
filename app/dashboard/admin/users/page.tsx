'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Plus } from 'lucide-react'
import { UserManagementTable } from '@/components/admin/user-management-table'
import { RoleAssignmentDialog } from '@/components/admin/role-assignment-dialog'

export default function UsersManagement() {
  const [users] = useState([
    { 
      id: '1', 
      name: 'John Doe', 
      email: 'john@example.com', 
      role: 'user' as const, 
      status: 'active' as const,
      joinedAt: 'Jan 15, 2024',
      lastActive: '2 hours ago',
    },
    { 
      id: '2', 
      name: 'Jane Smith', 
      email: 'jane@example.com', 
      role: 'admin' as const, 
      status: 'active' as const,
      joinedAt: 'Dec 20, 2023',
      lastActive: '30 mins ago',
    },
    { 
      id: '3', 
      name: 'Mike Johnson', 
      email: 'mike@example.com', 
      role: 'user' as const, 
      status: 'inactive' as const,
      joinedAt: 'Feb 10, 2024',
      lastActive: '5 days ago',
    },
  ])

  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)

  const handleEdit = (user: any) => {
    setSelectedUser(user)
    setRoleDialogOpen(true)
  }

  const handleDelete = (userId: string) => {
    console.log('Delete user:', userId)
  }

  const handleConfirmRole = (role: string) => {
    console.log('Assign role:', role, 'to user:', selectedUser?.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-8 h-8 text-primary" />
            Users Management
          </h1>
          <p className="text-muted-foreground mt-2">Manage all system users and assign roles</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      <UserManagementTable
        users={users}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <RoleAssignmentDialog
        open={roleDialogOpen}
        userId={selectedUser?.id}
        userName={selectedUser?.name}
        currentRole={selectedUser?.role}
        onOpenChange={setRoleDialogOpen}
        onConfirm={handleConfirmRole}
      />
    </div>
  )
}
