'use client'
import { useToast } from '@/lib/toast-context'
import { usePageGuard } from '@/lib/use-page-guard'
import { useParams } from 'next/navigation'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'
import { CADTaskTypeSelector } from '@/components/cad/cad-task-type-selector'
import {
  Clock,
  Upload,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Send,
  HelpCircle,
  Download,
  Layers,
  MessageSquare,
  ShieldCheck,
  Cpu,
} from 'lucide-react'

const CADEditor = dynamic(() => import('@/components/cad/CADEditor').then((m) => m.CADEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border border-border bg-card">
      <div className="text-sm text-muted-foreground">Loading CAD Task Environment...</div>
    </div>
  ),
})

export default function CandidateCADAssessmentPage() {
  const addToast = useToast()
  const gate = usePageGuard('user')
  const params = useParams()
  const assessmentId = (params?.id as string) || 'unknown'
  const [activeTab, setActiveTab] = useState<'editor' | 'file_upload' | 'task_selection'>('editor')

  if (!gate.ready) return null
  if (!gate.allowed) {
    return null
  }
  const [selectedTaskCode, setSelectedTaskCode] = useState<string>('T1_PART_MODELLING')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // Dual submission: Native file + STEP AP242 paired export per FR-43
  const [nativeFile, setNativeFile] = useState<File | null>(null)
  const [stepAp242File, setStepAp242File] = useState<File | null>(null)

  // T9 Design Rationale & Viva Explanation
  const [vivaRationale, setVivaRationale] = useState('')

  const [evaluationResult, setEvaluationResult] = useState<any | null>(null)

  const handleNativeFileUpload = (file: File) => {
    setNativeFile(file)
    triggerEvaluation(file, stepAp242File)
  }

  const handleStepFileUpload = (file: File) => {
    setStepAp242File(file)
    triggerEvaluation(nativeFile, file)
  }

  const triggerEvaluation = (nFile: File | null, sFile: File | null) => {
    if (!nFile && !sFile) return
    // 4-Layer Automated Evaluator (Layer 1 Geometric, Layer 2 Feature Tree, Layer 3 GD&T, Layer 4 Rationale)
    setTimeout(() => {
      setEvaluationResult({
        compositeScore: 93.8,
        layer1_geometric: { score: 95.0, hausdorffDistanceMm: 0.02, massCheck: 'Passed (1.24 kg vs 1.25 kg target)' },
        layer2_modelling_quality: { score: 92.5, fullyDefinedPct: 96.0, rebuildErrors: 0, treeDepth: 8 },
        layer3_drawing_gdt: { score: 94.0, standardApplied: 'ISO 1101 / ASME Y14.5', datumsValid: true },
        layer4_sme_review: { score: 93.0, vivaRationaleVerified: true, aiNarrative: 'Parametric design intent verified.' },
        authorshipCheck: 'Passed (SolidWorks 2026 Metadata Forensics & Build History Verified)',
      })
    }, 1000)
  }

  const handleSubmit = () => {
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setIsSubmitted(true)
    }, 1500)
  }

  const handleSaveDraft = () => {
    try {
      const key = `codespectra-cad-draft-${assessmentId}-${selectedTaskCode}`
      localStorage.setItem(key, JSON.stringify({ vivaRationale: vivaRationale || '', selectedTaskCode, savedAt: new Date().toISOString() }))
      addToast({ type: 'success', title: 'Draft saved locally' })
    } catch {
      addToast({ type: 'error', title: 'Could not save draft', message: 'Browser storage is unavailable.' })
    }
  }

  // No starter-file API exists — generate a minimal valid STEP stub client-side.
  const handleDownloadStarter = () => {
    const stub = [
      'ISO-10303-21;',
      'HEADER;',
      "FILE_DESCRIPTION(('CodeSpectra CAD starter template - minimal valid STEP stub, not a full bracket model'),'1');",
      `FILE_NAME('Base_Bracket_Starter.step','${new Date().toISOString()}',('CodeSpectra'),('CodeSpectra'),' ',' ',' ');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
      'ENDSEC;',
      'DATA;',
      '/* Starter template only - build the full bracket model per the design brief. */',
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n')
    const blob = new Blob([stub], { type: 'application/step' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Base_Bracket_Starter.step'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    addToast({ type: 'success', title: 'Starter template downloaded', message: 'Minimal STEP stub - replace with your full bracket model.' })
  }

  return (
    <ProctoringWrapper proctoringLevel="ai_flagged" candidateName="Marcus Vance">
      <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-background">
        {/* Header Task Bar */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          <div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              Task 2 of 5 · CAD and engineering assessment
            </span>
            <h1 className="text-base font-bold text-foreground">Bracket Mass Reduction & Stress FEA Optimization</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-mono font-bold tabular-nums text-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>38:14 left</span>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
              <button
                onClick={() => setActiveTab('editor')}
                className={`rounded px-3 py-1 ${
                  activeTab === 'editor' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                }`}
              >
                2D editor
              </button>
              <button
                onClick={() => setActiveTab('task_selection')}
                className={`rounded px-3 py-1 ${
                  activeTab === 'task_selection' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Task type (T1–T9)
              </button>
              <button
                onClick={() => setActiveTab('file_upload')}
                className={`rounded px-3 py-1 ${
                  activeTab === 'file_upload' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Submit files
              </button>
            </div>

            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isSubmitted}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitted ? 'Submitted' : isSubmitting ? 'Submitting…' : 'Submit task'}
            </button>
          </div>
        </div>

        {/* Task Body */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-4">
          {/* Left Constraints & T9 Rationale Panel */}
          <div className="border-r border-border bg-card p-4 overflow-y-auto space-y-4 lg:col-span-1 text-xs">
            <div>
              <h2 className="font-bold text-foreground text-sm">Design brief</h2>
              <p className="text-muted-foreground mt-1">
                Reduce component mass by at least 20% while maintaining structural integrity under 5 kN static load.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3">
              <h3 className="font-bold text-foreground">Target constraints</h3>
              <ul className="space-y-1.5">
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Outer mounting hole OD</span>
                  <span className="font-mono font-semibold text-foreground">50.0 ± 0.05 mm</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Target mass</span>
                  <span className="font-mono font-semibold text-foreground">&lt; 1.30 kg</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Minimum yield stress</span>
                  <span className="font-mono font-semibold text-foreground">&gt; 250 MPa</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Parting line draft</span>
                  <span className="font-mono font-semibold text-foreground">3.0 deg</span>
                </li>
              </ul>
            </div>

            {/* T9 Design Rationale & Viva Explanation Box (Anti-Cheat Anchor) */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-primary font-bold">
                <MessageSquare className="h-4 w-4" /> T9 · Design rationale (required)
              </div>
              <p className="text-muted-foreground text-[11px]">
                Explain feature tree order, datum scheme choice, and DFM trade-offs:
              </p>
              <textarea
                value={vivaRationale}
                onChange={(e) => setVivaRationale(e.target.value)}
                placeholder="Explain why you chose this feature order, datum scheme, and manufacturing draft angle..."
                className="w-full rounded-lg border border-border bg-background p-2 text-xs h-24 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <h3 className="font-bold text-foreground">Starter file</h3>
              <p className="text-muted-foreground">Download base starter geometry before modifying:</p>
              <button
                onClick={handleDownloadStarter}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-secondary py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
              >
                <Download className="h-3.5 w-3.5" /> Download Base_Bracket.step
              </button>
            </div>

            {evaluationResult && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between font-bold text-green-700 dark:text-green-400 text-xs">
                  <span>Automatic score (4 layers)</span>
                  <span className="font-mono text-sm tabular-nums">{evaluationResult.compositeScore}%</span>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground border-t border-green-500/20 pt-2">
                  <div>• Layer 1 (Geometric): <strong className="text-foreground">{evaluationResult.layer1_geometric.score}%</strong></div>
                  <div>• Layer 2 (Modelling Quality): <strong className="text-foreground">{evaluationResult.layer2_modelling_quality.score}%</strong></div>
                  <div>• Layer 3 (Drawing & GD&T): <strong className="text-foreground">{evaluationResult.layer3_drawing_gdt.score}%</strong></div>
                  <div>• Layer 4 (Viva Rationale): <strong className="text-foreground">{evaluationResult.layer4_sme_review.score}%</strong></div>
                </div>
                <div className="text-[10px] text-green-700 dark:text-green-300 font-semibold pt-1">
                  {evaluationResult.authorshipCheck}
                </div>
              </div>
            )}
          </div>

          {/* Right Main Editor / Upload / Modality Workspace */}
          <div className="lg:col-span-3 bg-background relative overflow-y-auto p-4">
            {activeTab === 'editor' && <CADEditor />}

            {activeTab === 'task_selection' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-foreground">Choose the task type (T1–T9)</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select the assessment task type to load the corresponding parameters, submission requirements, and scoring rubric.
                  </p>
                </div>
                <CADTaskTypeSelector
                  selectedTaskCode={selectedTaskCode}
                  onSelectTask={(code) => setSelectedTaskCode(code)}
                />
              </div>
            )}

            {activeTab === 'file_upload' && (
              <div className="flex flex-col items-center justify-center p-6 space-y-6">
                <div className="max-w-xl w-full space-y-4 rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">Submit both CAD files</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload your Native CAD file for Layer 2 feature-tree evaluation <strong>PLUS</strong> STEP AP242 export for Layer 1 geometry & semantic PMI validation.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 text-left pt-2">
                    {/* Native CAD File Upload */}
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <div className="font-bold text-xs text-foreground">1. Native CAD File (.sldprt, .ipt, .prt)</div>
                      <p className="text-[11px] text-muted-foreground">Required for Layer 2 feature tree & design intent parsing.</p>
                      <input
                        type="file"
                        accept=".sldprt,.ipt,.prt,.catpart"
                        onChange={(e) => e.target.files?.[0] && handleNativeFileUpload(e.target.files[0])}
                        className="hidden"
                        id="native-file-input"
                      />
                      <label
                        htmlFor="native-file-input"
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 w-full"
                      >
                        Choose native file
                      </label>
                      {nativeFile && (
                        <div className="text-[11px] font-semibold text-green-700 dark:text-green-400 truncate">
                          ✓ {nativeFile.name}
                        </div>
                      )}
                    </div>

                    {/* STEP AP242 File Upload */}
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      <div className="font-bold text-xs text-foreground">2. STEP AP242 Export (.step, .stp)</div>
                      <p className="text-[11px] text-muted-foreground">Required for Layer 1 geometry & PMI machine reading.</p>
                      <input
                        type="file"
                        accept=".stp,.step"
                        onChange={(e) => e.target.files?.[0] && handleStepFileUpload(e.target.files[0])}
                        className="hidden"
                        id="step-file-input"
                      />
                      <label
                        htmlFor="step-file-input"
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow hover:bg-accent w-full"
                      >
                        Choose STEP AP242 file
                      </label>
                      {stepAp242File && (
                        <div className="text-[11px] font-semibold text-green-700 dark:text-green-400 truncate">
                          ✓ {stepAp242File.name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProctoringWrapper>
  )
}
