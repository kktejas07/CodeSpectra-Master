'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import {
  Briefcase, ExternalLink, Clock, Loader2,
  CheckCircle, XCircle, Hourglass, ArrowRight,
} from 'lucide-react'

interface AppliedJob {
  id: string
  jobId: string
  jobTitle: string
  company: string
  appliedAt: string
  status: 'submitted' | 'in_review' | 'rejected' | 'accepted' | 'withdrawn'
  resumeName: string | null
}

const STATUS_CONFIG: Record<AppliedJob['status'], { label: string; color: string; icon: any }> = {
  submitted:   { label: 'Submitted',    color: 'bg-blue-500/20 text-blue-700',    icon: Hourglass },
  in_review:   { label: 'In Review',   color: 'bg-yellow-500/20 text-yellow-700', icon: Clock },
  rejected:    { label: 'Rejected',    color: 'bg-red-500/20 text-red-700',       icon: XCircle },
  accepted:    { label: 'Accepted',   color: 'bg-green-500/20 text-green-700',   icon: CheckCircle },
  withdrawn:   { label: 'Withdrawn',   color: 'bg-gray-500/20 text-gray-700',     icon: XCircle },
}

export default function DashboardJobsPage() {
  const { user } = useAuth()
  const gate = usePageGuard('user')
  const addToast = useToast()
  const [applications, setApplications] = useState<AppliedJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready || !user) return
    fetch('/api/jobs/applications', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setApplications(data) })
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load applications' }))
      .finally(() => setLoading(false))
  }, [gate.ready, user])

  if (!gate.ready) return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Applications</h1>
          <p className="text-muted-foreground mt-1">Track your job applications and their status</p>
        </div>
        <Button variant="outline" asChild className="gap-1.5">
          <Link href="/jobs">Browse Jobs <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : applications.length === 0 ? (
        <Card className="border-border/60 p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-lg font-medium">No applications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse open positions and apply to ones that interest you.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/jobs">Browse Open Jobs</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map(app => {
            const cfg = STATUS_CONFIG[app.status]
            const Icon = cfg.icon
            return (
              <Card key={app.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Briefcase className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{app.jobTitle || 'Unknown Position'}</p>
                    <p className="text-sm text-muted-foreground truncate">{app.company || 'Company'}</p>
                  </div>
                  <Badge className={`gap-1 ${cfg.color} shrink-0`}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Applied {new Date(app.appliedAt).toLocaleDateString()}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/jobs/${app.jobId}`} target="_blank">
                      View Job <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="border-t pt-6">
        <p className="text-sm text-muted-foreground mb-2">Looking for more opportunities?</p>
        <Button asChild><Link href="/jobs">Explore Open Positions</Link></Button>
      </div>
    </div>
  )
}