'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Users, Settings, BarChart3, Users2, Activity, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function TeamAdminDashboard() {
  const router = useRouter()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    teamMembers: 0,
    activeMembers: 0,
    pending: 0,
  })

  useEffect(() => {
    fetchTeamData()
  }, [])

  const fetchTeamData = async () => {
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

      // Check if user is admin
      if (!profile || profile.role !== 'admin') {
        console.log('[v0] Unauthorized access to team admin dashboard')
        router.push('/dashboard')
        return
      }

      // Get team statistics
      const { data: teamUsers } = await supabase
        .from('profiles')
        .select('*')

      if (teamUsers) {
        setStats({
          teamMembers: teamUsers.length,
          activeMembers: Math.floor(teamUsers.length * 0.85),
          pending: Math.floor(teamUsers.length * 0.15),
        })
      }
    } catch (error) {
      console.error('[v0] Error fetching team data:', error)
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
            <Users2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
            <p className="text-muted-foreground">Manage your team members and settings</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Team Members</p>
              <p className="text-3xl font-bold text-foreground">{stats.teamMembers}</p>
            </div>
            <Users className="w-8 h-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Active</p>
              <p className="text-3xl font-bold text-foreground">{stats.activeMembers}</p>
            </div>
            <Activity className="w-8 h-8 text-primary/40" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Pending Invites</p>
              <p className="text-3xl font-bold text-foreground">{stats.pending}</p>
            </div>
            <Users2 className="w-8 h-8 text-primary/40" />
          </div>
        </Card>
      </div>

      {/* Team Management Controls */}
      <div className="rounded-lg bg-card border border-border/40 p-8 space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          Team Controls
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button className="h-12 justify-start">
            <Users className="w-5 h-5 mr-3" />
            Manage Team Members
          </Button>
          <Button className="h-12 justify-start">
            <BarChart3 className="w-5 h-5 mr-3" />
            Team Analytics
          </Button>
          <Button className="h-12 justify-start">
            <Settings className="w-5 h-5 mr-3" />
            Team Settings & Roles
          </Button>
          <Button className="h-12 justify-start">
            <Activity className="w-5 h-5 mr-3" />
            Team Activity Log
          </Button>
        </div>
      </div>

      {/* Team Activity */}
      <div className="rounded-lg bg-card border border-border/40 p-8">
        <h2 className="text-xl font-bold text-foreground mb-6">Team Activity</h2>
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg border border-border/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-foreground">Member Joined</p>
                <p className="text-sm text-muted-foreground">alex_dev completed onboarding</p>
              </div>
              <span className="text-xs text-muted-foreground">1 hour ago</span>
            </div>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg border border-border/20">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-foreground">Role Updated</p>
                <p className="text-sm text-muted-foreground">sarah_user promoted to senior developer</p>
              </div>
              <span className="text-xs text-muted-foreground">3 hours ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
