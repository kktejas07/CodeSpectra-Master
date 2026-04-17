import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GitBranch, TrendingUp, Calendar, Users } from 'lucide-react'

interface Branch {
  id: string
  name: string
  isMainBranch: boolean
  type: 'long-lived' | 'short-lived'
  
  // Metrics
  linesOfCode: number
  issues: number
  coverage: number
  
  // Activity
  lastAnalysis: Date
  lastCommit: Date
  commits: number
  contributors: number
}

interface BranchAnalyticsProps {
  branches?: Branch[]
}

export function BranchAnalytics({ branches = [] }: BranchAnalyticsProps) {
  const [sortBy, setSortBy] = useState<'name' | 'issues' | 'coverage' | 'activity'>('name')

  const sortedBranches = [...branches].sort((a, b) => {
    switch (sortBy) {
      case 'issues':
        return b.issues - a.issues
      case 'coverage':
        return b.coverage - a.coverage
      case 'activity':
        return b.lastCommit.getTime() - a.lastCommit.getTime()
      case 'name':
      default:
        return a.name.localeCompare(b.name)
    }
  })

  const getBranchTypeIcon = (type: string) => {
    return type === 'long-lived' ? '📍' : '🌿'
  }

  const getBranchTypeLabel = (type: string) => {
    return type === 'long-lived' ? 'Long-lived (main, develop, etc)' : 'Short-lived (feature/bugfix branches)'
  }

  const getHealthScore = (branch: Branch) => {
    const issueScore = Math.max(0, 100 - branch.issues * 5)
    const coverageScore = branch.coverage
    return Math.round((issueScore + coverageScore) / 2)
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-600'
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-600'
    return 'bg-red-500/20 text-red-600'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Branch Analytics</h1>
        <p className="text-foreground/60">Track quality metrics across all branches</p>
      </div>

      {/* Controls */}
      <div className="flex gap-2 justify-end flex-wrap">
        {['name', 'issues', 'coverage', 'activity'].map((option) => (
          <Button
            key={option}
            variant={sortBy === option ? 'default' : 'outline'}
            onClick={() => setSortBy(option as any)}
            size="sm"
          >
            {option === 'name' && 'Name'}
            {option === 'issues' && 'Most Issues'}
            {option === 'coverage' && 'Coverage'}
            {option === 'activity' && 'Recent'}
          </Button>
        ))}
      </div>

      {/* Branch List */}
      <div className="space-y-4">
        {branches.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <GitBranch className="w-12 h-12 text-foreground/30 mx-auto mb-3" />
            <p className="text-foreground/60">No branches found</p>
          </Card>
        ) : (
          sortedBranches.map((branch) => {
            const healthScore = getHealthScore(branch)

            return (
              <Card key={branch.id} className="p-6 hover:shadow-lg transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl">{getBranchTypeIcon(branch.type)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg text-foreground">{branch.name}</h3>
                        {branch.isMainBranch && (
                          <Badge variant="default">Main Branch</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {branch.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground/60 mt-1">
                        {getBranchTypeLabel(branch.type)}
                      </p>
                    </div>
                  </div>

                  <Badge className={getHealthColor(healthScore)}>
                    {healthScore}% Health
                  </Badge>
                </div>

                {/* Metrics Grid */}
                <div className="grid md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">
                      {(branch.linesOfCode / 1000).toFixed(1)}k
                    </p>
                    <p className="text-xs text-foreground/60">Lines of Code</p>
                  </div>

                  <div className="text-center">
                    <p className={`text-2xl font-bold ${branch.issues > 10 ? 'text-red-600' : branch.issues > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {branch.issues}
                    </p>
                    <p className="text-xs text-foreground/60">Open Issues</p>
                  </div>

                  <div className="text-center">
                    <p className={`text-2xl font-bold ${branch.coverage < 60 ? 'text-red-600' : branch.coverage < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {branch.coverage}%
                    </p>
                    <p className="text-xs text-foreground/60">Coverage</p>
                  </div>

                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">{branch.commits}</p>
                    <p className="text-xs text-foreground/60">Commits</p>
                  </div>

                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground flex items-center justify-center gap-1">
                      <Users className="w-4 h-4" />
                      {branch.contributors}
                    </p>
                    <p className="text-xs text-foreground/60">Contributors</p>
                  </div>
                </div>

                {/* Activity Info */}
                <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-4 text-sm text-foreground/60">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Last commit: {branch.lastCommit.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>Last analyzed: {branch.lastAnalysis.toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Warnings */}
                {branch.coverage < 60 && (
                  <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                    <p className="text-sm text-yellow-600">
                      ⚠️ Coverage is below 60%. Consider adding more tests.
                    </p>
                  </div>
                )}

                {branch.issues > 10 && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
                    <p className="text-sm text-red-600">
                      ✗ High number of open issues. Please address quality concerns.
                    </p>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
