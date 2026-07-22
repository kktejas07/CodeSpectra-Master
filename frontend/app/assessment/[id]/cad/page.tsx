'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ProctoringWrapper } from '@/components/proctoring/ProctoringWrapper'
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
  const [activeTab, setActiveTab] = useState<'editor' | 'file_upload'>('editor')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [evaluationResult, setEvaluationResult] = useState<any | null>(null)

  const handleFileUpload = (file: File) => {
    setUploadedFile(file)
    // Simulated background automated mass properties & tolerance evaluator
    setTimeout(() => {
      setEvaluationResult({
        autoScore: 92.5,
        checksPassed: 4,
        totalChecks: 4,
        details: [
          { name: 'Outer Diameter', target: 50.0, actual: 50.02, unit: 'mm', passed: true },
          { name: 'Total Mass', target: 1.25, actual: 1.24, unit: 'kg', passed: true },
          { name: 'Wall Thickness', target: 3.0, actual: 3.0, unit: 'mm', passed: true },
          { name: 'Yield Strength FEA', target: 250, actual: 275, unit: 'MPa', passed: true },
        ],
        authorshipCheck: 'Passed (SolidWorks 2026 Metadata Verified)',
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

  return (
    <ProctoringWrapper proctoringLevel="ai_flagged" candidateName="Marcus Vance">
      <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-background">
        {/* Header Task Bar */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          <div>
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
              TASK 2 of 5 • CAD DESIGN
            </span>
            <h1 className="text-base font-bold text-foreground">Bracket Mass Reduction & Stress FEA Optimization</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-mono font-bold text-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>38:14 Remaining</span>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
              <button
                onClick={() => setActiveTab('editor')}
                className={`rounded px-3 py-1 ${
                  activeTab === 'editor' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                }`}
              >
                2D Canvas Editor
              </button>
              <button
                onClick={() => setActiveTab('file_upload')}
                className={`rounded px-3 py-1 ${
                  activeTab === 'file_upload' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Native 3D CAD Upload (SolidWorks/STEP)
              </button>
            </div>

            <button
              onClick={() => alert('Progress Saved')}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <Save className="h-3.5 w-3.5" /> Save Draft
            </button>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isSubmitted}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {isSubmitted ? 'Submitted!' : isSubmitting ? 'Submitting...' : 'Submit Task'}
            </button>
          </div>
        </div>

        {/* Task Body */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-4">
          {/* Left Constraints Panel */}
          <div className="border-r border-border bg-card p-4 overflow-y-auto space-y-4 lg:col-span-1 text-xs">
            <div>
              <h2 className="font-bold text-foreground text-sm">Design Brief & Parameters</h2>
              <p className="text-muted-foreground mt-1">
                Reduce component mass by at least 20% while maintaining structural integrity under 5 kN static load.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
              <h3 className="font-bold text-foreground">Target Constraints Checklist</h3>
              <ul className="space-y-1.5">
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Outer Mounting Hole OD:</span>
                  <span className="font-mono font-semibold text-foreground">50.0 ± 0.05 mm</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Target Component Mass:</span>
                  <span className="font-mono font-semibold text-foreground">&lt; 1.30 kg</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Minimum Yield Stress:</span>
                  <span className="font-mono font-semibold text-foreground">&gt; 250 MPa</span>
                </li>
                <li className="flex items-center justify-between text-muted-foreground">
                  <span>Parting Line Draft:</span>
                  <span className="font-mono font-semibold text-foreground">3.0 deg</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <h3 className="font-bold text-foreground">Reference File Starter</h3>
              <p className="text-muted-foreground">Download base starter geometry before modifying:</p>
              <button
                onClick={() => alert('Downloading starter CAD model')}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-secondary py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80"
              >
                <Download className="h-3.5 w-3.5" /> Download Base_Bracket.step
              </button>
            </div>

            {evaluationResult && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="h-4 w-4" /> Pre-computed Auto Checks: {evaluationResult.autoScore}%
                </div>
                <div className="text-[11px] text-muted-foreground">{evaluationResult.authorshipCheck}</div>
              </div>
            )}
          </div>

          {/* Right Main Editor / Upload Workspace */}
          <div className="lg:col-span-3 bg-background relative overflow-hidden">
            {activeTab === 'editor' ? (
              <CADEditor />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="max-w-md space-y-4 rounded-xl border border-dashed border-border bg-card p-8 shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">Upload Native 3D CAD Deliverable</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload your completed SolidWorks (.sldprt), STEP (.stp, .step), or IGES (.igs) model file.
                    </p>
                  </div>

                  <input
                    type="file"
                    accept=".sldprt,.stp,.step,.igs,.iges"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0])
                      }
                    }}
                    className="hidden"
                    id="cad-file-input"
                  />
                  <label
                    htmlFor="cad-file-input"
                    className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
                  >
                    Select CAD File
                  </label>

                  {uploadedFile && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-left text-xs">
                      <div className="font-semibold text-foreground">{uploadedFile.name}</div>
                      <div className="text-muted-foreground">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProctoringWrapper>
  )
}
