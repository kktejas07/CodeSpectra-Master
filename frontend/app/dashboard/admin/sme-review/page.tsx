'use client'

import { useState } from 'react'
import { usePageGuard } from '@/lib/use-page-guard'
import {
  Award,
  CheckCircle,
  FileText,
  ShieldAlert,
  UserCheck,
  Edit3,
  ExternalLink,
  Sliders,
  Save,
  Layers,
  AlertTriangle,
} from 'lucide-react'

interface SMEReviewTask {
  submissionId: string
  candidateName: string
  requisitionCode: string
  discipline: string
  taskTitle: string
  modality: 'cad' | 'written'
  preComputedAutoScore: number
  smeManualScore: number | null
  rubricAnchorGuidelines: string
  candidateWrittenAnswer?: string
  proctorFlags: string[]
  status: 'Pending Review' | 'Graded'
}

const MOCK_REVIEW_QUEUE: SMEReviewTask[] = [
  {
    submissionId: 'sub-701',
    candidateName: 'Marcus Vance',
    requisitionCode: 'REQ-2026-089',
    discipline: 'Mechanical Design',
    taskTitle: 'Bracket Mass Reduction & Stress FEA Optimization',
    modality: 'cad',
    preComputedAutoScore: 92.5,
    smeManualScore: 95.0,
    rubricAnchorGuidelines: 'Evaluate fillet radii placement, rib stiffness, and draft angle ease of manufacturing.',
    proctorFlags: [],
    status: 'Graded',
  },
  {
    submissionId: 'sub-702',
    candidateName: 'David Chen',
    requisitionCode: 'REQ-2026-089',
    discipline: 'Mechanical Design',
    taskTitle: 'CNC Toolpath Feed Rate Adjustments for 6061-T6',
    modality: 'written',
    preComputedAutoScore: 75.0,
    smeManualScore: null,
    rubricAnchorGuidelines: 'Score 5: Names correct chip load per tooth, surface speed (SFM), and coolant strategy. Score 3: Correct feed rate but misses coolant.',
    candidateWrittenAnswer: 'I adjusted the spindle speed to 12,000 RPM and set the feed rate per tooth to 0.004 inches to prevent tool chatter.',
    proctorFlags: ['Tab switch logged (Count: 1)'],
    status: 'Pending Review',
  },
]

export default function SMEReviewPage() {
  const gate = usePageGuard('tenant_admin')
  const [tasks, setTasks] = useState<SMEReviewTask[]>(MOCK_REVIEW_QUEUE)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string>('sub-702')
  const [manualRating, setManualRating] = useState<number>(85)
  const [reviewerNotes, setReviewerNotes] = useState<string>('')

  const activeTask = tasks.find((t) => t.submissionId === activeSubmissionId) || tasks[0]

  const handleSaveGrade = () => {
    setTasks(
      tasks.map((t) =>
        t.submissionId === activeSubmissionId
          ? { ...t, smeManualScore: manualRating, status: 'Graded' }
          : t
      )
    )
    alert(`Saved SME grade (${manualRating}%) for ${activeTask.candidateName}!`)
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
      {/* Title Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">SME Review & Rubric Grading Workstation</h1>
          <p className="text-sm text-muted-foreground">
            Grade subjective CAD attributes and written responses with anchor rubrics. Human review of proctoring flags (FR-21, FR-22, FR-33).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Queue List */}
        <div className="rounded-xl border border-border bg-card shadow-sm lg:col-span-1 overflow-hidden">
          <div className="border-b border-border bg-muted/30 p-4 font-bold text-sm text-foreground">
            Review Queue ({tasks.filter((t) => t.status === 'Pending Review').length} Pending)
          </div>
          <div className="divide-y divide-border/40 text-xs">
            {tasks.map((t) => (
              <button
                key={t.submissionId}
                onClick={() => {
                  setActiveSubmissionId(t.submissionId)
                  setManualRating(t.smeManualScore || 85)
                }}
                className={`w-full p-4 text-left transition-colors ${
                  activeSubmissionId === t.submissionId ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-muted/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{t.candidateName}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      t.status === 'Graded' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 font-medium">{t.taskTitle}</div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                  <span>Auto-Check: <strong>{t.preComputedAutoScore}%</strong></span>
                  <span className="uppercase font-mono">{t.modality}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Active Grading Panel */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-2 space-y-5 text-xs">
          <div className="flex items-start justify-between border-b border-border/60 pb-4">
            <div>
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                {activeTask.requisitionCode} • {activeTask.discipline}
              </span>
              <h2 className="text-lg font-bold text-foreground mt-1">{activeTask.taskTitle}</h2>
              <div className="text-muted-foreground mt-0.5">Candidate: <strong className="text-foreground">{activeTask.candidateName}</strong></div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Pre-computed Auto Score</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeTask.preComputedAutoScore}%</div>
            </div>
          </div>

          {/* Written Answer / CAD Artefact Access */}
          {activeTask.modality === 'written' && activeTask.candidateWrittenAnswer && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
              <h3 className="font-bold text-foreground text-sm">Candidate Written Answer Payload</h3>
              <div className="rounded border border-border bg-background p-3 font-mono text-foreground leading-relaxed">
                "{activeTask.candidateWrittenAnswer}"
              </div>
            </div>
          )}

          {/* SME Rubric Guidelines */}
          <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" /> SME Rubric Anchor Examples
            </h3>
            <p className="text-muted-foreground leading-relaxed">{activeTask.rubricAnchorGuidelines}</p>
          </div>

          {/* Proctor Integrity Flag Audit */}
          {activeTask.proctorFlags.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4" /> Proctor Integrity Audit Log (Human Review Mandatory - FR-33)
              </div>
              {activeTask.proctorFlags.map((flag, idx) => (
                <div key={idx} className="text-foreground">• {flag}</div>
              ))}
            </div>
          )}

          {/* Rating Slider & Notes */}
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <label className="font-bold text-foreground text-sm">SME Manual Score Rating: {manualRating}%</label>
              <span className="text-muted-foreground">0% to 100%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={manualRating}
              onChange={(e) => setManualRating(Number(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />

            <div>
              <label className="font-semibold text-foreground">SME Reviewer Justification Notes</label>
              <textarea
                rows={3}
                placeholder="Enter justification feedback for hiring manager report..."
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              onClick={handleSaveGrade}
              className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
            >
              <Save className="h-4 w-4" /> Save SME Grade & Submit Evaluation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
