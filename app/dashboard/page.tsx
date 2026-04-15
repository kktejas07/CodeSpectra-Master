'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, Trophy, BookOpen, Zap, ArrowRight } from 'lucide-react'

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Welcome back!</h1>
        <p className="text-foreground/60">Ready to improve your coding skills?</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground/60">Rank</span>
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">#1,245</div>
          <p className="text-xs text-foreground/50 mt-1">Global</p>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground/60">Points</span>
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">2,450</div>
          <p className="text-xs text-foreground/50 mt-1">Total earned</p>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground/60">Challenges</span>
            <Code2 className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">42</div>
          <p className="text-xs text-foreground/50 mt-1">Completed</p>
        </div>

        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground/60">Streak</span>
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">7</div>
          <p className="text-xs text-foreground/50 mt-1">Days</p>
        </div>
      </div>

      {/* Quick Access */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Quick Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/dashboard/arena">
            <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-foreground">Coding Arena</h3>
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-foreground/60 mb-4">Solve challenges and climb the leaderboard</p>
              <div className="flex items-center text-primary text-sm font-medium">
                Start coding <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>

          <Link href="/dashboard/scanner">
            <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-foreground">Code Scanner</h3>
                <Code2 className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-foreground/60 mb-4">Get AI-powered feedback on your code</p>
              <div className="flex items-center text-primary text-sm font-medium">
                Analyze code <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>

          <Link href="/dashboard/learning">
            <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-foreground">Learning</h3>
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-foreground/60 mb-4">Master new concepts with structured courses</p>
              <div className="flex items-center text-primary text-sm font-medium">
                Continue learning <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>

          <Link href="/dashboard/leaderboard">
            <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-foreground">Leaderboard</h3>
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-foreground/60 mb-4">See where you stand against other developers</p>
              <div className="flex items-center text-primary text-sm font-medium">
                View rankings <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
        <div className="p-6 rounded-lg bg-card border border-border">
          <p className="text-foreground/60 text-sm">No recent activity yet. Start by solving a challenge or analyzing your code!</p>
        </div>
      </div>
    </div>
  )
}
