'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Lock, Users } from 'lucide-react'

interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
  userCount: number
}

export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRole, setNewRole] = useState({ name: '', description: '' })
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const allPermissions = [
    { id: 'view_dashboard', name: 'View Dashboard', category: 'dashboard' },
    { id: 'manage_team', name: 'Manage Team', category: 'team' },
    { id: 'manage_organization', name: 'Manage Organization', category: 'organization' },
    { id: 'create_exam', name: 'Create Exam', category: 'events' },
    { id: 'manage_exams', name: 'Manage Exams', category: 'events' },
    { id: 'create_codeathon', name: 'Create Codeathon', category: 'events' },
    { id: 'manage_codeathons', name: 'Manage Codeathons', category: 'events' },
    { id: 'post_jobs', name: 'Post Jobs', category: 'jobs' },
    { id: 'manage_jobs', name: 'Manage Jobs', category: 'jobs' },
    { id: 'review_resumes', name: 'Review Resumes', category: 'resumes' },
    { id: 'view_analytics', name: 'View Analytics', category: 'analytics' },
    { id: 'manage_integrations', name: 'Manage Integrations', category: 'integrations' },
    { id: 'manage_billing', name: 'Manage Billing', category: 'billing' }
  ]

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/roles')
      const data = await res.json()
      setRoles(data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRole = async () => {
    if (!newRole.name) return
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRole, permissions: selectedPermissions })
      })
      if (res.ok) {
        setNewRole({ name: '', description: '' })
        setSelectedPermissions([])
        setShowCreateModal(false)
        fetchRoles()
      }
    } catch (error) {
      console.error('Failed to create role:', error)
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Are you sure? This action cannot be undone.')) return
    try {
      await fetch(`/api/roles/${roleId}`, { method: 'DELETE' })
      fetchRoles()
    } catch (error) {
      console.error('Failed to delete role:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Roles & Permissions</h1>
          <p className="text-muted-foreground">Manage organization roles and their permissions</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {showCreateModal && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Role</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Role Name</label>
              <input
                type="text"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="e.g., Content Manager"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                placeholder="Role description"
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Permissions</label>
              <div className="grid grid-cols-2 gap-3">
                {allPermissions.map((perm) => (
                  <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(perm.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPermissions([...selectedPermissions, perm.id])
                        } else {
                          setSelectedPermissions(selectedPermissions.filter(p => p !== perm.id))
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{perm.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateRole} className="flex-1">Create Role</Button>
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {loading ? (
          <Card className="p-6 text-center">Loading roles...</Card>
        ) : roles.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No custom roles yet</Card>
        ) : (
          roles.map((role) => (
            <Card key={role.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {role.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRole(role.id)}
                >
                  Delete
                </Button>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {role.userCount} users
                </Badge>
                <Badge variant="secondary">
                  {role.permissions.length} permissions
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((perm) => (
                  <Badge key={perm} variant="outline" className="text-xs">
                    {perm}
                  </Badge>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
