import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, XCircle, Github, ExternalLink } from 'lucide-react'

interface PRAnalysis {
  id: string
  prNumber: number
  title: string
  author: string
  branch: string
  
  // Quality metrics
  newIssues: number
  fixedIssues: number
  coverage: number
  duplications: number
  
  // Gate status
  gateStatus: 'PASSED' | 'FAILED' | 'PENDING'
  
  // Time
  createdAt: Date
  url: string
}

interface PRIntegrationProps {
  prs?: PRAnalysis[]
  loading?: boolean
}

export function PRIntegration({ prs = [], loading = false }: PRIntegrationProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'PASSED' | 'FAILED' | 'PENDING'>('all')

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSED':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'PENDING':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PASSED: 'bg-green-500/20 text-green-600',
      FAILED: 'bg-red-500/20 text-red-600',
      PENDING: 'bg-yellow-500/20 text-yellow-600',
    }
    return colors[status] || 'bg-gray-500/20 text-gray-600'
  }

  const filteredPRs = prs.filter((pr) => filterStatus === 'all' || pr.gateStatus === filterStatus)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Pull Request Analysis</h1>
        <p className="text-foreground/60">Automatic quality checks on every pull request</p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'PASSED', 'FAILED', 'PENDING'].map((status) => (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status as any)}
            className="gap-2"
          >
            {status === 'all' && `All PRs (${prs.length})`}
            {status === 'PASSED' && `✓ Passed (${prs.filter((p) => p.gateStatus === 'PASSED').length})`}
            {status === 'FAILED' && `✗ Failed (${prs.filter((p) => p.gateStatus === 'FAILED').length})`}
            {status === 'PENDING' && `⏳ Pending (${prs.filter((p) => p.gateStatus === 'PENDING').length})`}
          </Button>
        ))}
      </div>

      {/* PR List */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-foreground/60">Loading pull requests...</p>
          </Card>
        ) : filteredPRs.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Github className="w-12 h-12 text-foreground/30 mx-auto mb-3" />
            <p className="text-foreground/60">No pull requests found</p>
          </Card>
        ) : (
          filteredPRs.map((pr) => (
            <Card key={pr.id} className="p-6 hover:shadow-lg transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(pr.gateStatus)}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-foreground">{pr.title}</h3>
                      <Badge className={getStatusColor(pr.gateStatus)}>
                        {pr.gateStatus === 'PASSED' ? '✓ Passed' : pr.gateStatus === 'FAILED' ? '✗ Failed' : '⏳ Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground/60 mt-1">
                      #{pr.prNumber} • by {pr.author} • on branch <code className="bg-muted px-2 py-1 rounded text-xs">{pr.branch}</code>
                    </p>
                  </div>
                </div>

                <Button variant="outline" className="gap-2" onClick={() => window.open(pr.url, '_blank')}>
                  <ExternalLink className="w-4 h-4" />
                  View PR
                </Button>
              </div>

              {/* Metrics Grid */}
              <div className="grid md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{pr.newIssues}</p>
                  <p className="text-xs text-foreground/60">New Issues</p>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{pr.fixedIssues}</p>
                  <p className="text-xs text-foreground/60">Fixed Issues</p>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{pr.coverage}%</p>
                  <p className="text-xs text-foreground/60">Coverage</p>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{pr.duplications}%</p>
                  <p className="text-xs text-foreground/60">Duplication</p>
                </div>

                <div className="text-center">
                  <p className="text-xs text-foreground/50">
                    {pr.createdAt.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-foreground/60">Created</p>
                </div>
              </div>

              {/* Quality Summary */}
              {pr.newIssues > 0 && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded">
                  <p className="text-sm text-red-600">
                    ⚠️ This PR introduces {pr.newIssues} new issue{pr.newIssues !== 1 ? 's' : ''}. Please address before merging.
                  </p>
                </div>
              )}

              {pr.newIssues === 0 && pr.gateStatus === 'PASSED' && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded">
                  <p className="text-sm text-green-600">
                    ✓ Quality gate passed. Ready to merge!
                  </p>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
