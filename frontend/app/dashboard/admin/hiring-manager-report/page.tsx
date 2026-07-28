'use client'
import { useToast } from '@/lib/toast-context'

import { useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import {
  Award,
  CheckCircle,
  FileCheck,
  FileSpreadsheet,
  Layers,
  Search,
  UserCheck,
  ExternalLink,
  ShieldCheck,
  Building,
} from 'lucide-react'

interface CandidateScoreCard {
  candidateId: string
  name: string
  email: string
  requisitionCode: string
  experienceBand: '0-1 yr' | '2-3 yr' | '4-6 yr'
  compositeScore: number
  cadScore: number
  qnaScore: number
  writtenScore: number
  psychometricScore: number
  englishScore: number
  proctorFlagsCount: number
  rank: number
  shortlistStatus: 'Shortlisted' | 'Under Review' | 'Rejected'
  cadArtifactUrl: string
}

const MOCK_SHORTLIST: CandidateScoreCard[] = [
  {
    candidateId: 'cand-8901',
    name: 'Marcus Vance',
    email: 'marcus.vance@example.com',
    requisitionCode: 'REQ-2026-089',
    experienceBand: '2-3 yr',
    compositeScore: 92.4,
    cadScore: 95.0,
    qnaScore: 90.0,
    writtenScore: 88.0,
    psychometricScore: 94.0,
    englishScore: 96.0,
    proctorFlagsCount: 0,
    rank: 1,
    shortlistStatus: 'Shortlisted',
    cadArtifactUrl: '/dashboard/cad',
  },
  {
    candidateId: 'cand-8902',
    name: 'Elena Rostova',
    email: 'elena.r@example.com',
    requisitionCode: 'REQ-2026-089',
    experienceBand: '2-3 yr',
    compositeScore: 87.8,
    cadScore: 88.5,
    qnaScore: 86.0,
    writtenScore: 90.0,
    psychometricScore: 85.0,
    englishScore: 92.0,
    proctorFlagsCount: 0,
    rank: 2,
    shortlistStatus: 'Shortlisted',
    cadArtifactUrl: '/dashboard/cad',
  },
  {
    candidateId: 'cand-8903',
    name: 'David Chen',
    email: 'd.chen@example.com',
    requisitionCode: 'REQ-2026-089',
    experienceBand: '2-3 yr',
    compositeScore: 78.2,
    cadScore: 74.0,
    qnaScore: 82.0,
    writtenScore: 75.0,
    psychometricScore: 80.0,
    englishScore: 85.0,
    proctorFlagsCount: 1,
    rank: 3,
    shortlistStatus: 'Under Review',
    cadArtifactUrl: '/dashboard/cad',
  },
]

export default function HiringManagerReportPage() {
  const addToast = useToast()
  const gate = usePageGuard('tenant_admin')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedReq, setSelectedReq] = useState('REQ-2026-089')

  const filteredCandidates = MOCK_SHORTLIST.filter((c) => {
    const nameMatch = (c.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    const reqMatch = selectedReq === 'All' || c.requisitionCode === selectedReq
    return nameMatch && reqMatch
  })

  if (!gate.ready) return null

  return (
    <div className="space-y-6 p-6">
      {/* Page Title */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Hiring Manager Report & Shortlist</h1>
          <p className="text-sm text-muted-foreground">
            Clear 1-page candidate breakdown with sub-scores per modality (CAD, Technical Q&A, Written, Psychometric, English).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => addToast({ type: 'info', title: 'Notification', message: 'Exporting Hiring Manager Summary Report as PDF...' })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Manager PDF
          </button>
        </div>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold text-muted-foreground">Active Requisition</div>
          <div className="text-lg font-bold text-foreground mt-1">REQ-2026-089</div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Mechanical Design Engineer II</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold text-muted-foreground">Funnel Ratio</div>
          <div className="text-lg font-bold text-foreground mt-1">100 In ➔ 24 Out</div>
          <div className="text-[11px] text-muted-foreground mt-1">24% Pass-through rate</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold text-muted-foreground">Shortlist Threshold</div>
          <div className="text-lg font-bold text-foreground mt-1">75.0% Composite</div>
          <div className="text-[11px] text-muted-foreground mt-1">Weighted Modality Cutoff</div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold text-muted-foreground">Reviewer Time Saved</div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">82% Reduction</div>
          <div className="text-[11px] text-muted-foreground mt-1">Pre-computed CAD checks</div>
        </div>
      </div>

      {/* Candidate Shortlist Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/30 p-4">
          <h2 className="text-sm font-bold text-foreground">Ranked Candidate Shortlist</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
            <tr>
              <th className="py-3 px-4">Rank & Candidate</th>
              <th className="py-3 px-4">Band</th>
              <th className="py-3 px-4">Composite</th>
              <th className="py-3 px-4">CAD Score (40%)</th>
              <th className="py-3 px-4">Tech Q&A (25%)</th>
              <th className="py-3 px-4">Written (15%)</th>
              <th className="py-3 px-4">Psychometric (10%)</th>
              <th className="py-3 px-4">English (10%)</th>
              <th className="py-3 px-4">Integrity</th>
              <th className="py-3 px-4 text-right">Artefact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 text-foreground">
            {filteredCandidates.map((c) => (
              <tr key={c.candidateId} className="transition-colors hover:bg-muted/20">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                      #{c.rank}
                    </span>
                    <div>
                      <div className="font-semibold text-foreground">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 font-medium">{c.experienceBand}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {c.compositeScore}%
                  </span>
                </td>
                <td className="py-3 px-4 font-mono font-medium">{c.cadScore}%</td>
                <td className="py-3 px-4 font-mono">{c.qnaScore}%</td>
                <td className="py-3 px-4 font-mono">{c.writtenScore}%</td>
                <td className="py-3 px-4 font-mono">{c.psychometricScore}%</td>
                <td className="py-3 px-4 font-mono">{c.englishScore}%</td>
                <td className="py-3 px-4">
                  {c.proctorFlagsCount === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> Clean
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                      {c.proctorFlagsCount} Flag(s)
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <a
                    href={c.cadArtifactUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground hover:bg-secondary/80"
                  >
                    View CAD Model <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
