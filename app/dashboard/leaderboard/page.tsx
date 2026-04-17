'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, Calendar } from 'lucide-react'

export default function LeaderboardPage() {
  const [view, setView] = useState<'global' | 'team' | 'monthly'>('global')

  const topRankers = [
    {
      rank: 1,
      name: 'marco_codes',
      title: 'GRANDMASTER',
      level: 99,
      xp: 210000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marco',
      badge: '👑',
      undefeated: true,
    },
    {
      rank: 2,
      name: 'Sarah.dev',
      title: 'SILVER ARCHITECT',
      level: 88,
      xp: 124000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
      badge: '🥈',
      undefeated: false,
    },
    {
      rank: 3,
      name: 'Aiden.X',
      title: 'BRONZE LEAD',
      level: 76,
      xp: 98000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=aiden',
      badge: '🥉',
      undefeated: false,
    },
  ]

  const fullRankings = [
    { rank: 4, name: 'ZeroCool', title: 'ELITE CONTRIBUTOR', level: 72, xp: 88432, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zero', language: 'Python' },
    { rank: 5, name: 'NeonPulse', title: 'SECURITY SPECIALIST', level: 65, xp: 72110, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=neon', language: 'Rust' },
    { rank: 6, name: 'Felix (You)', title: 'RISING STAR', level: 54, xp: 56800, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=felix', language: 'TypeScript' },
    { rank: 7, name: 'GhostProtocol', title: 'KERNEL DEV', level: 49, xp: 42900, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ghost', language: 'C++' },
  ]

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-card border border-border rounded-lg p-4 sticky top-20">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Leaderboards
          </h2>
          
          <nav className="space-y-2">
            {[
              { value: 'global', label: 'Global Rankings', icon: TrendingUp },
              { value: 'team', label: 'Team Rankings', icon: Trophy },
              { value: 'monthly', label: 'Monthly Contest', icon: Calendar }
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setView(value as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                  view === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Global Leaderboards</h1>
          <p className="text-foreground/60">The arena where elite developers battle for architectural dominance. Top performers earn limited-edition badges and priority beta access.</p>
        </div>

        {/* Top 3 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topRankers.map((ranker) => (
            <Card
              key={ranker.rank}
              className={`p-6 relative overflow-hidden transition-all hover:shadow-lg ${
                ranker.rank === 1 ? 'md:col-span-1 border-primary/50 bg-gradient-to-br from-primary/10' : ''
              }`}
            >
              {/* Rank Badge */}
              <div className="absolute top-4 right-4 text-3xl">{ranker.badge}</div>

              {/* Rank Number */}
              <Badge className="absolute top-4 left-4" variant={ranker.rank === 1 ? 'default' : 'secondary'}>
                #{ranker.rank}
              </Badge>

              <div className="flex flex-col items-center text-center space-y-4 pt-8">
                {/* Avatar */}
                <div className="relative">
                  <img
                    src={ranker.avatar}
                    alt={ranker.name}
                    className="w-32 h-32 rounded-full border-4 border-primary/50 object-cover"
                  />
                  {ranker.undefeated && <Badge className="absolute bottom-0 right-0 bg-yellow-500">UNDEFEATED</Badge>}
                </div>

                {/* Info */}
                <div>
                  <p className="text-xs text-foreground/60 mb-1">{ranker.title}</p>
                  <p className="text-xl font-bold">{ranker.name}</p>
                  <p className="text-sm text-foreground/70">Level {ranker.level}</p>
                </div>

                {/* XP */}
                <div className="w-full bg-muted rounded-lg p-3">
                  <p className="text-xs text-foreground/60 mb-1">Total XP</p>
                  <p className="text-lg font-bold text-primary">{ranker.xp.toLocaleString()}</p>
                </div>

                <Button className="w-full">View Profile</Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Full Rankings */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Top Contributors</h2>
          <div className="space-y-2">
            {fullRankings.map((ranker) => (
              <div key={ranker.rank} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Badge variant="outline" className="w-12 text-center">#{ranker.rank}</Badge>
                <img src={ranker.avatar} alt={ranker.name} className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <p className="font-medium">{ranker.name}</p>
                  <p className="text-xs text-foreground/60">{ranker.title}</p>
                </div>
                <Badge variant="secondary">{ranker.language}</Badge>
                <div className="text-right">
                  <p className="font-bold">Lv {ranker.level}</p>
                  <p className="text-xs text-foreground/60">{ranker.xp.toLocaleString()} XP</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const [view, setView] = useState<'global' | 'team' | 'monthly'>('global')

  const topRankers = [
    {
      rank: 1,
      name: 'marco_codes',
      title: 'GRANDMASTER',
      level: 99,
      xp: 210000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=marco',
      badge: '👑',
      undefeated: true,
    },
    {
      rank: 2,
      name: 'Sarah.dev',
      title: 'SILVER ARCHITECT',
      level: 88,
      xp: 124000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
      badge: '🥈',
      undefeated: false,
    },
    {
      rank: 3,
      name: 'Aiden.X',
      title: 'BRONZE LEAD',
      level: 76,
      xp: 98000,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=aiden',
      badge: '🥉',
      undefeated: false,
    },
  ]

  const fullRankings = [
    { rank: 4, name: 'ZeroCool', title: 'ELITE CONTRIBUTOR', level: 72, xp: 88432, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zero', language: 'Python' },
    { rank: 5, name: 'NeonPulse', title: 'SECURITY SPECIALIST', level: 65, xp: 72110, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=neon', language: 'Rust' },
    { rank: 6, name: 'Felix (You)', title: 'RISING STAR', level: 54, xp: 56800, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=felix', language: 'TypeScript' },
    { rank: 7, name: 'GhostProtocol', title: 'KERNEL DEV', level: 49, xp: 42900, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ghost', language: 'C++' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Global Leaderboards</h1>
        <p className="text-foreground/60">The arena where elite developers battle for architectural dominance. Top performers earn limited-edition badges and priority beta access.</p>
      </div>

      {/* View Toggle */}
      <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-fit gap-0 bg-muted/50 border border-border/40 rounded-lg p-0.5">
          <TabsTrigger value="global" className="rounded-md">Global</TabsTrigger>
          <TabsTrigger value="team" className="rounded-md">Team</TabsTrigger>
          <TabsTrigger value="monthly" className="rounded-md">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value={view} className="space-y-6">
          {/* Top 3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topRankers.map((ranker) => (
              <Card
                key={ranker.rank}
                className={`p-6 relative overflow-hidden transition-all hover:shadow-lg ${
                  ranker.rank === 1 ? 'md:col-span-1 border-primary/50 bg-gradient-to-br from-primary/10' : ''
                }`}
              >
                {/* Rank Badge */}
                <div className="absolute top-4 right-4 text-3xl">{ranker.badge}</div>

                {/* Rank Number */}
                <Badge className="absolute top-4 left-4" variant={ranker.rank === 1 ? 'default' : 'secondary'}>
                  #{ranker.rank}
                </Badge>

                <div className="flex flex-col items-center text-center space-y-4 pt-8">
                  {/* Avatar */}
                  <div className="relative">
                    <img
                      src={ranker.avatar}
                      alt={ranker.name}
                      className="w-32 h-32 rounded-full border-4 border-primary/50 object-cover"
                    />
                    {ranker.undefeated && <Badge className="absolute bottom-0 right-0 bg-yellow-500">UNDEFEATED</Badge>}
                  </div>

                  {/* Info */}
                  <div>
                    <p className="text-xs text-foreground/60 mb-1">{ranker.title}</p>
                    <p className="text-xl font-bold">{ranker.name}</p>
                    <p className="text-sm text-foreground/60 mt-2">
                      Lvl {ranker.level} • {ranker.xp.toLocaleString()} XP
                    </p>
                  </div>

                  {/* Trophy */}
                  {ranker.rank === 1 && <Badge className="mt-4">⭐ GRANDMASTER TIER</Badge>}
                </div>
              </Card>
            ))}
          </div>

          {/* Full Rankings Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-4 text-left text-sm font-semibold">RANK</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">ENGINEER</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">INTELLIGENCE LEVEL</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">EXPERIENCE (XP)</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">MAIN LANGUAGE</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {fullRankings.map((user) => (
                    <tr key={user.rank} className="border-b border-border hover:bg-background/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-lg">{String(user.rank).padStart(2, '0')}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-foreground/60">{user.title}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-background rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${(user.level / 100) * 100}%` }} />
                          </div>
                          <span className="text-sm font-medium">Lvl {user.level}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{user.xp.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{user.language}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-green-500/20 text-green-700">Active</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <p className="text-sm text-foreground/60">Showing 1-10 of 2,450 competitors</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                {[1, 2, 3].map((page) => (
                  <Button key={page} variant={page === 1 ? 'default' : 'outline'} size="sm">
                    {page}
                  </Button>
                ))}
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
