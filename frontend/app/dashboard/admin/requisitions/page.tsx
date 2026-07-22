'use client'

import { useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import {
  Building2,
  Plus,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'

interface RequisitionItem {
  id: string
  title: string
  reqCode: string
  discipline: string
  region: string
  experienceBand: '0-1 yr' | '2-3 yr' | '4-6 yr'
  workdayId: string
  smeEmails: string[]
  hiringManagerEmail: string
  passThreshold: number
  shortlistRule: 'rank' | 'threshold' | 'composite'
  status: 'active' | 'draft' | 'closed'
}

const INITIAL_REQS: RequisitionItem[] = [
  {
    id: 'req-01',
    title: 'Mechanical Design Engineer II',
    reqCode: 'REQ-2026-089',
    discipline: 'Mechanical Design',
    region: 'NA-EAST',
    experienceBand: '2-3 yr',
    workdayId: 'WD-REQ-9901',
    smeEmails: ['sme.mech1@axiss.com', 'sme.mech2@axiss.com'],
    hiringManagerEmail: 'hm.engineering@client.com',
    passThreshold: 75,
    shortlistRule: 'composite',
    status: 'active',
  },
  {
    id: 'req-02',
    title: 'Manufacturing Operations Lead',
    reqCode: 'REQ-2026-092',
    discipline: 'Manufacturing',
    region: 'APAC',
    experienceBand: '4-6 yr',
    workdayId: 'WD-REQ-9904',
    smeEmails: ['sme.mfg1@axiss.com'],
    hiringManagerEmail: 'hm.mfg@client.com',
    passThreshold: 80,
    shortlistRule: 'threshold',
    status: 'active',
  },
]

export default function RequisitionsPage() {
  const gate = usePageGuard('superadmin')
  const [reqs, setReqs] = useState<RequisitionItem[]>(INITIAL_REQS)
  const [searchTerm, setSearchTerm] = useState('')
  const [syncingReqId, setSyncingReqId] = useState<string | null>(null)

  const filteredReqs = reqs.filter((r) => {
    const titleMatch = (r.title || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    const codeMatch = (r.reqCode || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    return titleMatch || codeMatch
  })

  const triggerWorkdaySync = (id: string) => {
    setSyncingReqId(id)
    setTimeout(() => {
      setSyncingReqId(null)
      alert(`Workday Candidate Stage Sync completed for Requisition ${id}!`)
    }, 1200)
  }

  if (!gate.ready) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workday Requisitions</h1>
          <p className="text-sm text-muted-foreground">
            Manage pilot requisitions, Workday ISU sync, SME panels, and composite shortlist rules.
          </p>
        </div>
        <button
          onClick={() => alert('Add Requisition Modal')}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Link Workday Req
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search requisition or Workday ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredReqs.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                  {r.reqCode}
                </span>
                <h2 className="text-base font-bold text-foreground mt-1">{r.title}</h2>
                <div className="text-xs text-muted-foreground mt-0.5">Workday ID: {r.workdayId}</div>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {r.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 border-y border-border/40 py-3 text-xs">
              <div>
                <div className="text-muted-foreground">Discipline</div>
                <div className="font-semibold text-foreground">{r.discipline}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Region</div>
                <div className="font-semibold text-foreground">{r.region}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Experience Band</div>
                <div className="font-semibold text-foreground">{r.experienceBand}</div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Hiring Manager:</span>
                <span className="font-medium text-foreground">{r.hiringManagerEmail}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Assigned SMEs:</span>
                <span className="font-medium text-foreground">{r.smeEmails.join(', ')}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Shortlist Rule:</span>
                <span className="font-medium text-foreground capitalize">
                  {r.shortlistRule} (Cutoff: {r.passThreshold}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => triggerWorkdaySync(r.id)}
                disabled={syncingReqId === r.id}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingReqId === r.id ? 'animate-spin' : ''}`} />
                {syncingReqId === r.id ? 'Syncing Workday...' : 'Trigger Workday Stage Sync'}
              </button>

              <button
                onClick={() => alert(`Broadcasting invites for ${r.reqCode}`)}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Send className="h-3.5 w-3.5" /> Invite Cohort
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
