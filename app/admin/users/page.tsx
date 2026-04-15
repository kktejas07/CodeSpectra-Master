'use client'

import { Users, Search, Edit2, Trash2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'

const users = [
  {
    id: 1,
    name: 'Alex Chen',
    email: 'alex@example.com',
    role: 'user',
    joined: '2 months ago',
    challenges: 87,
    status: 'active',
  },
  {
    id: 2,
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    role: 'user',
    joined: '1 month ago',
    challenges: 81,
    status: 'active',
  },
  {
    id: 3,
    name: 'Sam Rodriguez',
    email: 'sam@example.com',
    role: 'moderator',
    joined: '3 weeks ago',
    challenges: 78,
    status: 'active',
  },
  {
    id: 4,
    name: 'Taylor Kim',
    email: 'taylor@example.com',
    role: 'user',
    joined: '1 week ago',
    challenges: 24,
    status: 'inactive',
  },
  {
    id: 5,
    name: 'Morgan Smith',
    email: 'morgan@example.com',
    role: 'user',
    joined: '3 days ago',
    challenges: 5,
    status: 'active',
  },
]

export default function UsersPage() {
  const [search, setSearch] = useState('')

  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
        </div>
        <p className="text-foreground/60">Manage platform users</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-foreground/40" />
        <Input
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-background border-border text-foreground placeholder:text-foreground/50"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Users</p>
          <p className="text-3xl font-bold text-foreground">10,245</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Active Today</p>
          <p className="text-3xl font-bold text-foreground">3,421</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">New This Week</p>
          <p className="text-3xl font-bold text-foreground">234</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">User</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Role</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Joined</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Challenges</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Status</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-sm text-foreground/50">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {user.role === 'moderator' && (
                        <Shield className="w-4 h-4 text-primary" />
                      )}
                      <span className="text-sm text-foreground/70 capitalize">{user.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-foreground/70">{user.joined}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-medium text-foreground">{user.challenges}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {user.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 hover:bg-background rounded transition">
                        <Edit2 className="w-4 h-4 text-foreground/60" />
                      </button>
                      <button className="p-2 hover:bg-background rounded transition">
                        <Trash2 className="w-4 h-4 text-red-400/60" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
