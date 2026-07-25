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
  Eye,
  EyeOff,
  Sparkles,
  GitCompare,
} from 'lucide-react'

interface SMEReviewTask {
  submissionId: string
  candidateName: string
  requisitionCode: string
  discipline: string
  taskTitle: string
  modality: 'cad' | 'written'
  layer1GeometricScore: number
  layer2ModellingQualityScore: number
  layer3DrawingGdtScore: number
  preComputedAutoScore: number
  smeManualScore: number | null
  rubricAnchorGuidelines: string
  aiDraftNarrative: string
  featureTreeDiff: string[]
  vivaRationaleText?: string
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
    layer1GeometricScore: 95.0,
    layer2ModellingQualityScore: 92.5,
    layer3DrawingGdtScore: 94.0,
    preComputedAutoScore: 93.8,
    smeManualScore: 95.0,
    rubricAnchorGuidelines: 'Evaluate fillet radii placement, rib stiffness, and draft angle ease of manufacturing.',
    aiDraftNarrative: 'Candidate model exhibits clean parametric feature ordering with 96% fully-defined sketches. Minimal Hausdorff shape deviation (0.02 mm). Viva rationale confirms candidate authorship.',
    featureTreeDiff: [
      '+ Base Extrude (Modified for 20% mass cut)',
      '+ Rib Pattern [4x] (Added stiffness)',
      '+ Fillet R2.0 (Applied after shell)',
    ],
    vivaRationaleText: 'I started by creating the primary datum reference plane from the mounting face, then applied shell feature before adding stiffening ribs to avoid geometry recalculation errors.',
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
    layer1GeometricScore: 80.0,
    layer2ModellingQualityScore: 75.0,
    layer3DrawingGdtScore: 70.0,
    preComputedAutoScore: 75.0,
    smeManualScore: null,
    rubricAnchorGuidelines: 'Score 5: Names correct chip load per tooth, surface speed (SFM), and coolant strategy. Score 3: Correct feed rate but misses coolant.',
    aiDraftNarrative: 'Written response covers chip load per tooth (0.004 in) and spindle RPM (12,000). Misses explicit coolant strategy.',
    featureTreeDiff: ['+ Modified Toolpath Parameter (Feed Rate adjusted)'],
    vivaRationaleText: 'I adjusted spindle speed to 12,000 RPM and set feed rate per tooth to 0.004 inches to prevent chatter.',
    proctorFlags: ['Tab switch logged (Count: 1)'],
    status: 'Pending Review',
  },
]

export default function SMEReviewPage() {
  const gate = usePageGuard('tenant_admin')
  const [tasks, setTasks] = useState<SMEReviewTask[]>(MOCK_REVIEW_QUEUE)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string>('sub-702')
  const [blindReviewMode, setBlindReviewMode] = useState<boolean>(true) // FR-88 Blind Review default
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
    alert(`Saved SME grade (${manualRating}%) for ${blindReviewMode ? 'Candidate ID ' + activeTask.submissionId : activeTask.candidateName}!`)
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">SME Layer 4 Review & Rubric Workstation</h1>
          <p className="text-sm text-muted-foreground">
            Layer 4 human judgement workstation with pre-populated Layer 1-3 auto scores, 3D heat map diffs, AI draft narratives (Add-on H), and blind review governance (FR-88).
          </p>
        </div>

        {/* Blind Review Toggle */}
        <button
          onClick={() => setBlindReviewMode(!blindReviewMode)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow transition-colors ${
            blindReviewMode
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-accent'
          }`}
        >
          {blindReviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span>{blindReviewMode ? 'Blind Review Active (FR-88)' : 'Show Candidate Names'}</span>
        </button>
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
                  <span className="font-bold text-foreground">
                    {blindReviewMode ? `Candidate ${t.submissionId.toUpperCase()}` : t.candidateName}
                  </span>
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
                  <span>Layers 1-3 Score: <strong>{t.preComputedAutoScore}%</strong></span>
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
              <div className="text-muted-foreground mt-0.5">
                Candidate Identifier:{' '}
                <strong className="text-foreground">
                  {blindReviewMode ? `Anonymized ID (${activeTask.submissionId})` : activeTask.candidateName}
                </strong>
              </div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Pre-computed Auto Score</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeTask.preComputedAutoScore}%</div>
            </div>
          </div>

          {/* Pre-Populated Layer 1-3 Score Flags (FR-86) */}
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div>
              <div className="text-muted-foreground text-[11px]">Layer 1 (Geometric)</div>
              <div className="font-bold text-foreground text-sm">{activeTask.layer1GeometricScore}%</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Layer 2 (Modelling Quality)</div>
              <div className="font-bold text-foreground text-sm">{activeTask.layer2ModellingQualityScore}%</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Layer 3 (Drawing & GD&T)</div>
              <div className="font-bold text-foreground text-sm">{activeTask.layer3DrawingGdtScore}%</div>
            </div>
          </div>

          {/* Feature Tree Diff (FR-85) & T9 Viva Rationale */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <GitCompare className="h-4 w-4 text-primary" /> Feature Tree Diff vs Reference
              </h3>
              <div className="space-y-1 font-mono text-[11px] bg-muted/30 p-2.5 rounded border border-border/40">
                {activeTask.featureTreeDiff.map((d, i) => (
                  <div key={i} className="text-emerald-600 dark:text-emerald-400">{d}</div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" /> T9 Candidate Viva Rationale
              </h3>
              <div className="rounded border border-border/60 bg-background p-2.5 font-mono text-muted-foreground leading-relaxed text-[11px] h-24 overflow-y-auto">
                "{activeTask.vivaRationaleText || 'No viva rationale text submitted.'}"
              </div>
            </div>
          </div>

          {/* AI-Drafted Narrative Review Assistant (Add-on H / FR-91) */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <h3 className="font-bold text-primary text-sm flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" /> AI Design Review Assistant Draft Narrative (FR-91)
            </h3>
            <p className="text-muted-foreground leading-relaxed text-xs">{activeTask.aiDraftNarrative}</p>
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
              <label className="font-bold text-foreground text-sm">Layer 4 SME Manual Score: {manualRating}%</label>
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
                placeholder="Enter reviewer feedback to accompany the final score report..."
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
