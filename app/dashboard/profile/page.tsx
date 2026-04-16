'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Edit2, Trophy, Target, Flame } from 'lucide-react'

export default function ProfilePage() {
  const [userStats] = useState({
    name: 'Alex "Void" Sterling',
    role: 'ELITE ARCHITECT',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    level: 42,
    currentXP: 85420,
    maxXP: 100000,
    globalRank: '#1,204',
    rankImprovement: '+12 positions',
    contributions: '4.8k',
  })

  const competencies = [
    { name: 'Security Architecture', percentage: 94 },
    { name: 'System Performance', percentage: 88 },
    { name: 'Concurrency Logic', percentage: 76 },
    { name: 'AI Implementation', percentage: 62 },
  ]

  const achievements = [
    { name: 'Security Oracle', description: 'TOP 1% VULNERABILITY HUNTER', icon: '🔐' },
    { name: 'Rapid Refactor', description: 'FASTEST LOGIC FIXES', icon: '⚡' },
    { name: 'Exterminator', description: '100+ CRITICAL FIXES', icon: '🎯' },
    { name: 'Cloud Voyager', description: 'DEPLOYMENT MASTER', icon: '☁️' },
  ]

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Avatar Section */}
        <div className="md:col-span-1 flex flex-col items-center space-y-4">
          <div className="relative">
            <img
              src={userStats.avatar}
              alt="Profile"
              className="w-40 h-40 rounded-lg border-2 border-primary/20 object-cover"
            />
            <Badge className="absolute bottom-2 right-2 bg-primary text-primary-foreground">
              Lvl {userStats.level}
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="w-full">
            <Edit2 className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        </div>

        {/* Stats Section */}
        <div className="md:col-span-2 space-y-4">
          <div>
            <h1 className="text-4xl font-bold">{userStats.name}</h1>
            <p className="text-lg text-foreground/60 mt-1">{userStats.role}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-foreground/60 mb-1">CURRENT XP</p>
              <p className="text-2xl font-bold text-primary">{userStats.currentXP.toLocaleString()} / {userStats.maxXP.toLocaleString()}</p>
              <div className="mt-2 w-full bg-background rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${(userStats.currentXP / userStats.maxXP) * 100}%` }} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-foreground/60 mb-1">GLOBAL RANK</p>
              <p className="text-2xl font-bold">{userStats.globalRank}</p>
              <p className="text-sm text-green-500 mt-1">{userStats.rankImprovement}</p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-sm text-foreground/60">CONTRIBUTIONS</p>
                  <p className="text-2xl font-bold">{userStats.contributions}</p>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-foreground/60 mb-2">STREAK</p>
              <div className="flex gap-1">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className={`w-6 h-6 rounded ${i < 5 ? 'bg-primary' : 'bg-background border border-border'}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievements Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Mastery Achievements</h2>
          </div>
          <Button variant="ghost" size="sm">
            View All Unlocks
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {achievements.map((achievement, idx) => (
            <div key={idx} className="bg-background border border-border rounded-lg p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
              <div className="text-4xl">{achievement.icon}</div>
              <p className="font-semibold text-sm">{achievement.name}</p>
              <p className="text-xs text-foreground/60">{achievement.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Competency Map Section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Target className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Competency Map</h2>
        </div>

        <div className="space-y-4">
          {competencies.map((comp, idx) => (
            <div key={idx}>
              <div className="flex justify-between mb-2">
                <p className="font-medium">{comp.name}</p>
                <p className="text-primary font-bold">{comp.percentage}%</p>
              </div>
              <div className="w-full bg-background rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-primary to-primary/50 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${comp.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
