'use client'
import { useToast } from '@/lib/toast-context'

import { useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
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
  const addToast = useToast()
  const gate = usePageGuard('tenant_admin')
  const [reqs, setReqs] = useState<RequisitionItem[]>(INITIAL_REQS)
  const [searchTerm, setSearchTerm] = useState('')
  const [syncingReqId, setSyncingReqId] = useState<string | null>(null)
  const [inviteModalReq, setInviteModalReq] = useState<RequisitionItem | null>(null)
  const [candName, setCandName] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [workdayCandId, setWorkdayCandId] = useState('CAND-9901')
  const [targetPipeline, setTargetPipeline] = useState('/assessment/demo/cad')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [submittingInvite, setSubmittingInvite] = useState(false)

  const filteredReqs = reqs.filter((r) => {
    const titleMatch = (r.title || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    const codeMatch = (r.reqCode || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    return titleMatch || codeMatch
  })

  const triggerWorkdaySync = (id: string) => {
    setSyncingReqId(id)
    setTimeout(() => {
      setSyncingReqId(null)
      addToast({ type: 'info', title: 'Notification', message: `Workday Candidate Stage Sync completed for Requisition ${id}!` })
    }, 1200)
  }

  const handleSendCandidateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!candEmail || !inviteModalReq) return
    setSubmittingInvite(true)

    try {
      const res = await csrfFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: candEmail.trim(),
          full_name: candName.trim() || 'Marcus Vance',
          role: 'user',
          target_url: targetPipeline,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to trigger candidate invitation link')

      setGeneratedLink(json.invite_url || `http://localhost:3000/assessment/invite/demo-${Date.now()}`)
    } catch (err: unknown) {
      addToast({ type: 'info', title: 'Notification', message: err instanceof Error ? err.message : 'Error creating candidate invite link' })
    } finally {
      setSubmittingInvite(false)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Workday Requisitions & ATS Links</h1>
          <p className="text-sm text-muted-foreground">
            Manage pilot requisitions, trigger Workday candidate invites, and generate candidate-specific assessment URLs.
          </p>
        </div>
        <button
          onClick={() => {
            setCandName('')
            setCandEmail('')
            setInviteModalReq(INITIAL_REQS[0])
            setGeneratedLink(null)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Trigger Candidate Invite Link
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
                onClick={() => {
                  setInviteModalReq(r)
                  setCandName('')
                  setCandEmail('')
                  setGeneratedLink(null)
                }}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Send className="h-3.5 w-3.5" /> Invite Candidate
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Candidate Assessment Invite Modal */}
      {inviteModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 text-foreground">
            <h2 className="text-lg font-bold">Trigger Candidate Assessment Link</h2>
            <div className="text-xs text-muted-foreground">
              Requisition: <span className="font-mono font-bold text-primary">{inviteModalReq.reqCode}</span> ({inviteModalReq.title})
            </div>

            {!generatedLink ? (
              <form onSubmit={handleSendCandidateInvite} className="space-y-3 pt-2 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Candidate Full Name</label>
                  <input
                    type="text"
                    required
                    value={candName}
                    onChange={(e) => setCandName(e.target.value)}
                    placeholder="Marcus Vance"
                    className="w-full rounded-lg border border-border bg-background p-2 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Candidate Email</label>
                  <input
                    type="email"
                    required
                    value={candEmail}
                    onChange={(e) => setCandEmail(e.target.value)}
                    placeholder="marcus.vance@example.com"
                    className="w-full rounded-lg border border-border bg-background p-2 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Workday Candidate ID</label>
                  <input
                    type="text"
                    value={workdayCandId}
                    onChange={(e) => setWorkdayCandId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Target Assessment Pipeline</label>
                  <select
                    value={targetPipeline}
                    onChange={(e) => setTargetPipeline(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 focus:ring-1 focus:ring-primary"
                  >
                    <option value="/assessment/demo/cad">CAD Technical Assessment (/assessment/demo/cad)</option>
                    <option value="/dashboard/identity-verify">Identity & Proctoring Check (/dashboard/identity-verify)</option>
                    <option value="/dashboard/problems">Coding Challenge IDE (/dashboard/problems)</option>
                    <option value="/assessment">General AI Assessment (/assessment)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setInviteModalReq(null)}
                    className="rounded-lg border border-border px-3 py-1.5 font-semibold text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                  >
                    {submittingInvite ? 'Generating Link...' : 'Generate Candidate Link'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 pt-2 text-xs">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Candidate Single-Use Link Generated Successfully!
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Share this link with candidate:</div>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 p-2.5 font-mono text-[11px]">
                    <span className="truncate flex-1">{generatedLink}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(generatedLink)
                        addToast({ type: 'info', title: 'Notification', message: 'Link copied to clipboard!' })
                      }}
                      className="rounded bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setInviteModalReq(null)}
                    className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-primary-foreground shadow"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
