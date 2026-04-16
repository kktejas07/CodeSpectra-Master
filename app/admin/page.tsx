'use client'

import { BarChart3, Users, Trophy, BookOpen, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage CodeSpectra platform</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Users</span>
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-semibold text-foreground">10,245</div>
            <p className="text-xs text-green-600">+12% this month</p>
          </div>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Users</span>
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-semibold text-foreground">3,421</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Challenges</span>
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-semibold text-foreground">543</div>
            <p className="text-xs text-muted-foreground">Published</p>
          </div>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Courses</span>
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-semibold text-foreground">24</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>
      </div>

      {/* Management Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Management */}
        <div className="p-6 rounded-lg bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">User Management</h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• View and manage user accounts</p>
            <p>• Monitor user activity and progress</p>
            <p>• Handle user reports and support</p>
          </div>
          <Link href="/admin/users">
            <Button variant="outline" className="w-full">
              Manage Users
            </Button>
          </Link>
        </div>

        {/* Content Management */}
        <div className="p-6 rounded-lg bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Content Management</h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Create and edit challenges</p>
            <p>• Manage test cases and solutions</p>
            <p>• Review challenge difficulty</p>
          </div>
          <Link href="/admin/challenges">
            <Button variant="outline" className="w-full">
              Manage Challenges
            </Button>
          </Link>
        </div>

        {/* Learning Platform */}
        <div className="p-6 rounded-lg bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Learning Platform</h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• Create and manage courses</p>
            <p>• Add lessons and content</p>
            <p>• Track course completion</p>
          </div>
          <Link href="/admin/courses">
            <Button variant="outline" className="w-full">
              Manage Courses
            </Button>
          </Link>
        </div>

        {/* Analytics */}
        <div className="p-6 rounded-lg bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Analytics</h2>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• View platform statistics</p>
            <p>• Monitor user engagement</p>
            <p>• Generate reports</p>
          </div>
          <Button variant="outline" className="w-full">
            View Analytics
          </Button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6 rounded-lg bg-card border border-border space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm border-b border-border pb-3">
            <span className="text-muted-foreground">New user registered: john_doe</span>
            <span className="text-muted-foreground">2 hours ago</span>
          </div>
          <div className="flex justify-between text-sm border-b border-border pb-3">
            <span className="text-muted-foreground">Challenge created: Binary Search Trees</span>
            <span className="text-muted-foreground">5 hours ago</span>
          </div>
          <div className="flex justify-between text-sm border-b border-border pb-3">
            <span className="text-muted-foreground">Course published: Advanced Algorithms</span>
            <span className="text-muted-foreground">1 day ago</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">New support ticket received</span>
            <span className="text-muted-foreground">1 day ago</span>
          </div>
        </div>
      </div>
    </div>
  )
}
