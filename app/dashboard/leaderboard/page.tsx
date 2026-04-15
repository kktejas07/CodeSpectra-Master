'use client'

import { BarChart3, Trophy, TrendingUp } from 'lucide-react'

const leaderboardData = [
  { rank: 1, name: 'Alex Chen', points: 5420, challenges: 87, streak: 42 },
  { rank: 2, name: 'Jordan Lee', points: 5210, challenges: 81, streak: 35 },
  { rank: 3, name: 'Sam Rodriguez', points: 4980, challenges: 78, streak: 28 },
  { rank: 4, name: 'Taylor Kim', points: 4750, challenges: 74, streak: 21 },
  { rank: 5, name: 'Morgan Smith', points: 4520, challenges: 71, streak: 18 },
  { rank: 6, name: 'Casey Johnson', points: 4310, challenges: 68, streak: 15 },
  { rank: 7, name: 'River Davis', points: 4050, challenges: 63, streak: 12 },
  { rank: 8, name: 'Quinn Brown', points: 3890, challenges: 61, streak: 10 },
  { rank: 9, name: 'Parker Wilson', points: 3650, challenges: 57, streak: 8 },
  { rank: 10, name: 'You', points: 2450, challenges: 42, streak: 7 },
]

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Global Leaderboard</h1>
        </div>
        <p className="text-foreground/60">See how you rank against other developers worldwide</p>
      </div>

      {/* Your Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-6 rounded-lg bg-primary/10 border border-primary/30">
          <div className="text-3xl font-bold text-primary mb-2">#10</div>
          <p className="text-sm text-foreground/60">Your Rank</p>
        </div>
        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="text-3xl font-bold text-foreground mb-2">2,450</div>
          <p className="text-sm text-foreground/60">Total Points</p>
        </div>
        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="text-3xl font-bold text-foreground mb-2">42</div>
          <p className="text-sm text-foreground/60">Challenges Solved</p>
        </div>
        <div className="p-6 rounded-lg bg-card border border-border">
          <div className="text-3xl font-bold text-foreground mb-2">7</div>
          <p className="text-sm text-foreground/60">Day Streak</p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Rank</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">User</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Points</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Challenges</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Streak</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((entry, index) => (
                <tr
                  key={entry.rank}
                  className={`border-b border-border last:border-b-0 hover:bg-background/50 transition ${
                    entry.name === 'You' ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {entry.rank <= 3 ? (
                        <Trophy
                          className={`w-5 h-5 ${
                            entry.rank === 1
                              ? 'text-yellow-400'
                              : entry.rank === 2
                              ? 'text-gray-400'
                              : 'text-orange-400'
                          }`}
                        />
                      ) : (
                        <span className="text-foreground/60 font-medium">{entry.rank}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/50 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary-foreground">
                          {entry.name[0]}
                        </span>
                      </div>
                      <span className={`font-medium ${
                        entry.name === 'You' ? 'text-primary' : 'text-foreground'
                      }`}>
                        {entry.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-semibold text-foreground">{entry.points.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-foreground/70">{entry.challenges}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-foreground/70">{entry.streak}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <h3 className="font-semibold text-foreground mb-2">How Rankings Work</h3>
          <p className="text-sm text-foreground/60">
            Rankings are calculated based on total points earned. Points are awarded for solving
            challenges with higher difficulty levels offering more points.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <h3 className="font-semibold text-foreground mb-2">Streaks</h3>
          <p className="text-sm text-foreground/60">
            Maintain your streak by solving at least one challenge per day. Streaks help track
            consistency and dedication.
          </p>
        </div>
      </div>
    </div>
  )
}
