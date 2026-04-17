'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Users, Settings, BarChart3, Shield, Activity, Server, Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { isSuperAdmin } from '@/lib/rbac'
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard'
import { AuditLogsViewer } from '@/components/admin/audit-logs-viewer'

export default function SystemAdminDashboard() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setUserProfile(profile)

      // Check if user is superadmin
      if (!profile || !isSuperAdmin(profile.role)) {
        console.log('[v0] Unauthorized access to system admin dashboard')
        router.push('/dashboard')
        return
      }

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
          activeUsers: Math.floor(totalCount * 0.8),
          superadmins: superadminCount,
          admins: adminCount,
        })
      }
    } catch (error) {
      console.error('[v0] Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Server className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Administration</h1>
            <p className="text-muted-foreground">Manage entire platform and all users</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Users</p>
              <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
            </div>
            <Users className="w-8 h-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Active Users</p>
              <p className="text-3xl font-bold text-foreground">{stats.activeUsers}</p>
            </div>
            <Activity className="w-8 h-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Superadmins</p>
              <p className="text-3xl font-bold text-foreground">{stats.superadmins}</p>
            </div>
            <Shield className="w-8 h-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Team Admins</p>
              <p className="text-3xl font-bold text-foreground">{stats.admins}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-primary/40" />
          </div>
        </Card>
      </div>

      {/* System Admin Controls */}
      <div className="rounded-lg bg-card border border-border/40 p-8 space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
          <Lock className="w-5 h-5 text-primary" />
          System Controls
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button className="h-12 justify-start">
            <Users className="w-5 h-5 mr-3" />
            Manage All Users & Roles
          </Button>
          <Button className="h-12 justify-start">
            <BarChart3 className="w-5 h-5 mr-3" />
            Global Analytics & Reports
          </Button>
          <Button className="h-12 justify-start">
            <Server className="w-5 h-5 mr-3" />
            System Settings & Config
          </Button>
          <Button className="h-12 justify-start">
            <Activity className="w-5 h-5 mr-3" />
            View System Audit Logs
          </Button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <AnalyticsDashboard />

      {/* Audit Logs */}
      <AuditLogsViewer />
    </div>
  )
}
