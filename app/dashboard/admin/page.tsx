'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Users, Settings, BarChart3, Shield, Activity, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function AdminDashboard() {
  const [userProfile, setUserProfile] = useState<any>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    superadmins: 0,
    admins: 0,
  })

  useEffect(() => {
    fetchAdminData()
  }, [])

  const fetchAdminData = async () => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) return

      const supabase = createClient(supabaseUrl, supabaseKey)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setUserProfile(profile)

      // Get statistics
      const { data: allUsers } = await supabase
        .from('profiles')
        .select('role')

      if (allUsers) {
        const superadminCount = allUsers.filter((u) => u.role === 'superadmin').length
        const adminCount = allUsers.filter((u) => u.role === 'admin').length
        const totalCount = allUsers.length

        setStats({
          totalUsers: totalCount,
          activeUsers: Math.floor(totalCount * 0.8), // Simulated
          superadmins: superadminCount,
          admins: adminCount,
        })
      }
    } catch (error) {
      console.error('[v0] Error fetching admin data:', error)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {userProfile?.full_name}. Manage your platform here.</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Users */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Users</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
            <p className="text-xs text-green-500">+12% this month</p>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Active Now</span>
            <Activity className="w-5 h-5 text-green-500" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{stats.activeUsers}</p>
            <p className="text-xs text-muted-foreground">{Math.round((stats.activeUsers / stats.totalUsers) * 100)}% online</p>
          </div>
        </div>

        {/* Superadmins */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Superadmins</span>
            <Shield className="w-5 h-5 text-purple-500" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{stats.superadmins}</p>
            <p className="text-xs text-muted-foreground">Full system access</p>
          </div>
        </div>

        {/* Admins */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Admins</span>
            <BarChart3 className="w-5 h-5 text-blue-500" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-foreground">{stats.admins}</p>
            <p className="text-xs text-muted-foreground">Platform admins</p>
          </div>
        </div>
      </div>

      {/* Admin Controls */}
      <div className="bg-card border border-border/40 rounded-lg p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">Admin Controls</h2>
          <p className="text-sm text-muted-foreground">Manage users, roles, and platform settings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button variant="outline" className="justify-start h-11">
            <Users className="w-4 h-4 mr-2" />
            Manage Users
          </Button>
          <Button variant="outline" className="justify-start h-11">
            <Settings className="w-4 h-4 mr-2" />
            System Settings
          </Button>
          <Button variant="outline" className="justify-start h-11">
            <Shield className="w-4 h-4 mr-2" />
            Role Management
          </Button>
          <Button variant="outline" className="justify-start h-11">
            <TrendingUp className="w-4 h-4 mr-2" />
            Analytics
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
          <div className="space-y-3">
            <div className="p-3 bg-background/50 rounded-lg border border-border/20">
              <p className="text-sm font-medium text-foreground">New user registered</p>
              <p className="text-xs text-muted-foreground mt-1">2 minutes ago</p>
            </div>
            <div className="p-3 bg-background/50 rounded-lg border border-border/20">
              <p className="text-sm font-medium text-foreground">Admin role assigned</p>
              <p className="text-xs text-muted-foreground mt-1">1 hour ago</p>
            </div>
            <div className="p-3 bg-background/50 rounded-lg border border-border/20">
              <p className="text-sm font-medium text-foreground">System settings updated</p>
              <p className="text-xs text-muted-foreground mt-1">3 hours ago</p>
            </div>
          </div>
        </div>

        {/* Security Info */}
        <div className="bg-card border border-border/40 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Security Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/20">
              <span className="text-sm font-medium text-foreground">All systems</span>
              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-500 rounded font-semibold">Operational</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/20">
              <span className="text-sm font-medium text-foreground">User sessions</span>
              <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-500 rounded font-semibold">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/20">
              <span className="text-sm font-medium text-foreground">Backup status</span>
              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-500 rounded font-semibold">Last 1h ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
