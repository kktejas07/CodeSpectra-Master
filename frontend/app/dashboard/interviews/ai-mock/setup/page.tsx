'use client'
import { csrfFetch } from '@/lib/csrf-fetch'
import { formatDate } from '@/lib/format-datetime'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Brain, ArrowLeft, Loader2, FileText, Sparkles, Upload,
  CheckCircle, AlertCircle, ChevronDown, ClipboardPaste, User, PenLine
} from 'lucide-react'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader } from '@/components/app/page-kit'
import { ROLE_OPTIONS, DIFFICULTY_LEVELS } from '@/lib/interviews/ai-mock-types'

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

const DURATION_OPTIONS = [15, 20, 30, 45]

type ResumeSource = 'none' | 'draft' | 'profile' | 'upload'

interface ResumeDraftSummary {
  id: string
  name: string
  template: string
  updated_at: string
}

/** Last résumé choice, per browser (a convenience — the server never relies on it). */
const LAST_RESUME_KEY = 'cs:aimock:last-resume'
type LastResume = { source: ResumeSource; id?: string | null }

function readLastResume(): LastResume | null {
  try {
    const raw = localStorage.getItem(LAST_RESUME_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as LastResume
    return ['none', 'draft', 'profile', 'upload'].includes(v?.source) ? v : null
  } catch {
    return null
  }
}

function writeLastResume(v: LastResume) {
  try { localStorage.setItem(LAST_RESUME_KEY, JSON.stringify(v)) } catch { /* storage blocked */ }
}

interface ProfileResume {
  id: string
  file_name: string
  file_size: number
  text_content?: string | null
  status: string
  uploaded_at: string
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const textParts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ')
    if (pageText.trim()) textParts.push(pageText)
  }

  return textParts.join('\n\n')
}

export default function AiMockSetupPage() {
  const gate = usePageGuard('user')
  const router = useRouter()

  const [resumeText, setResumeText] = useState('')
  const [resumeSource, setResumeSource] = useState<ResumeSource>('none')
  const [profileResumes, setProfileResumes] = useState<ProfileResume[]>([])
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [loadingResumes, setLoadingResumes] = useState(false)
  const [resumesLoaded, setResumesLoaded] = useState(false)
  const [drafts, setDrafts] = useState<ResumeDraftSummary[]>([])
  const [draftsState, setDraftsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const lastChoice = useRef<LastResume | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [role, setRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [duration, setDuration] = useState(20)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const fetchResumes = useCallback(async () => {
    setLoadingResumes(true)
    try {
      const res = await fetch('/api/resumes')
      if (res.ok) {
        const data = (await res.json()) as ProfileResume[]
        setProfileResumes(Array.isArray(data) ? data : [])
        // Re-select the last uploaded résumé used, if it's still there.
        const last = lastChoice.current
        const match = last?.source === 'profile' && last.id ? data.find((r) => r.id === last.id && r.text_content) : null
        if (match) {
          setSelectedResumeId(match.id)
          setResumeText(match.text_content || '')
        }
      }
    } catch { /* silent */ }
    setResumesLoaded(true)
    setLoadingResumes(false)
  }, [])

  useEffect(() => {
    if (resumeSource === 'profile' && !resumesLoaded && !loadingResumes) {
      fetchResumes()
    }
  }, [resumeSource, resumesLoaded, loadingResumes, fetchResumes])

  useEffect(() => {
    if (resumeSource !== 'draft' || draftsState !== 'idle') return
    setDraftsState('loading')
    fetch('/api/resumes/drafts?list=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { drafts?: ResumeDraftSummary[] }) => {
        const list = d.drafts ?? []
        setDrafts(list)
        const last = lastChoice.current
        if (last?.source === 'draft' && last.id && list.some((x) => x.id === last.id)) setSelectedDraftId(last.id)
        setDraftsState('ready')
      })
      .catch(() => setDraftsState('error'))
  }, [resumeSource, draftsState])

  // Restore the last résumé choice once.
  useEffect(() => {
    const last = readLastResume()
    lastChoice.current = last
    if (last && last.source !== 'none') setResumeSource(last.source)
  }, [])

  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const aiMockSetupTour: TourStep[] = [
        {
          target: '[data-tour="ai-mock-setup-header"]',
          title: 'AI Practice For Candidates',
          description: 'This page configures an AI-led mock interview for practicing candidates.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-mock-resume-source"]',
          title: 'Resume source',
          description: 'Select a resume to get personalized interview questions. Upload a PDF or pick one from your profile.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-mock-setup-start"]',
          title: 'Start AI Interview',
          description: 'Click Start Interview to generate questions and enter your mock session.',
          position: 'top',
        },
        {
          target: '[data-tour="ai-mock-setup-options"]',
          title: 'Match settings to your goal',
          description: 'Pro tip: match difficulty to your target role for the best practice.',
          position: 'top',
        },
      ]
      autoPlayPageTour('ai-mock-setup', aiMockSetupTour)
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  const effectiveRole = role === 'Custom' ? customRole.trim() : role

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setExtractError('Only PDF files are supported.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setExtractError('File must be under 5 MB.')
      return
    }
    setExtracting(true)
    setExtractError('')
    try {
      const text = await extractTextFromPdf(file)
      if (!text.trim()) {
        setExtractError('Could not extract text from this PDF. It may be image-based.')
        setExtracting(false)
        return
      }
      setResumeText(text)
      setSelectedResumeId(null)
    } catch {
      setExtractError('Failed to read PDF. Please try another file.')
    }
    setExtracting(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }

  const handleSelectProfileResume = (resume: ProfileResume) => {
    setSelectedResumeId(resume.id)
    if (resume.text_content) {
      setResumeText(resume.text_content)
      setExtractError('')
    } else {
      setResumeText('')
      setExtractError('This resume doesn\'t have extracted text. Upload the PDF below to use it.')
    }
  }

  const handleSourceChange = (source: ResumeSource) => {
    setResumeSource(source)
    setExtractError('')
    if (source !== 'profile' && source !== 'upload') setResumeText('')
    if (source !== 'profile') setSelectedResumeId(null)
    if (source !== 'draft') setSelectedDraftId(null)
  }

  const handleStart = async () => {
    if (!effectiveRole) {
      setError('Please select or enter a role.')
      return
    }
    // Saved résumés go by id; the server loads (and owner-checks) the text.
    const selectedUpload = resumeSource === 'profile' && selectedResumeId
      ? profileResumes.find((r) => r.id === selectedResumeId && r.text_content)
      : undefined
    let resumeRef: { kind: 'draft' | 'uploaded'; id: string } | undefined
    if (resumeSource === 'draft') {
      if (!selectedDraftId) {
        setError('Pick a draft, or choose None to start without a resume.')
        return
      }
      resumeRef = { kind: 'draft', id: selectedDraftId }
    } else if (selectedUpload) {
      resumeRef = { kind: 'uploaded', id: selectedUpload.id }
    }
    setStarting(true)
    setError('')

    try {
      const res = await csrfFetch('/api/interviews/ai-mock/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumeRef,
          resumeText: resumeRef || resumeSource === 'none' ? undefined : resumeText.trim() || undefined,
          role: effectiveRole,
          difficulty,
          duration,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start interview.')
        setStarting(false)
        return
      }

      writeLastResume({ source: resumeSource, id: resumeRef?.id ?? null })
      sessionStorage.setItem(`aimock_${data.sessionId}`, JSON.stringify({
        sessionId: data.sessionId,
        firstQuestion: data.firstQuestion,
        totalQuestions: data.totalQuestions,
        role: effectiveRole,
        difficulty,
        duration,
      }))

      router.push(`/dashboard/interviews/ai-mock?session=${data.sessionId}`)
    } catch {
      setError('Network error. Please try again.')
      setStarting(false)
    }
  }

  const resumeSourceOptions: { value: ResumeSource; label: string; icon: React.ReactNode }[] = [
    { value: 'none', label: 'None', icon: <FileText className="h-4 w-4" aria-hidden /> },
    { value: 'draft', label: 'Builder draft', icon: <PenLine className="h-4 w-4" aria-hidden /> },
    { value: 'profile', label: 'My uploads', icon: <User className="h-4 w-4" aria-hidden /> },
    { value: 'upload', label: 'Upload PDF', icon: <Upload className="h-4 w-4" aria-hidden /> },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-4" data-tour="ai-mock-setup-header">
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to interviews
        </Link>
        <PageHeader
          className="mb-0"
          icon={<Brain aria-hidden />}
          title="AI mock interview"
          description="Pick a role, difficulty and length. Add your resume if you want questions tailored to your experience."
        />
      </div>

      <Card className="max-w-3xl rounded-3xl border-border/70 p-6 space-y-5" data-tour="ai-mock-setup-options">
        {/* Role */}
        <div className="space-y-2">
          <label htmlFor="mock-role" className="text-sm font-medium text-foreground">Target role</label>
          <select
            id="mock-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {role === 'Custom' && (
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Enter your target role…"
              aria-label="Custom target role"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Difficulty</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Difficulty">
            {DIFFICULTY_LEVELS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-200 ${
                  difficulty === d
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Duration</p>
          <div className="flex gap-2" role="group" aria-label="Duration">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                aria-pressed={duration === d}
                className={`min-h-10 flex-1 rounded-xl border px-3 py-2 text-xs font-medium tabular-nums transition-colors duration-200 ${
                  duration === d
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* Resume Source Selector */}
        <div className="space-y-3" data-tour="ai-mock-resume-source">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden /> Resume (optional)
          </p>

          {/* Segmented Control */}
          <div className="grid grid-cols-2 gap-0.5 rounded-xl border border-border bg-muted/50 p-0.5 sm:grid-cols-4" role="group" aria-label="Resume source">
            {resumeSourceOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSourceChange(opt.value)}
                aria-pressed={resumeSource === opt.value}
                className={`min-h-9 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  resumeSource === opt.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Résumé builder drafts */}
          {resumeSource === 'draft' && (
            <div className="space-y-2">
              {draftsState === 'loading' || draftsState === 'idle' ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border p-6">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  <span className="text-sm text-muted-foreground">Loading your drafts…</span>
                </div>
              ) : draftsState === 'error' ? (
                <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                  Couldn&apos;t load your drafts. Try again, or pick another source.
                </p>
              ) : drafts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-border p-6 text-center">
                  <PenLine className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium text-foreground">No saved drafts yet</p>
                  <p className="text-xs text-muted-foreground">
                    Build one in the{' '}
                    <Link href="/dashboard/resumes/builder" className="text-primary underline">resume builder</Link>
                    , or upload a PDF instead.
                  </p>
                </div>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Saved drafts">
                  {drafts.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedDraftId === d.id}
                      onClick={() => setSelectedDraftId(d.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selectedDraftId === d.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <PenLine className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">Updated {formatDate(d.updated_at)}</p>
                      </div>
                      {selectedDraftId === d.id && <CheckCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Questions are tailored to the draft as it is saved now.</p>
            </div>
          )}

          {/* Upload PDF Panel */}
          {resumeSource === 'upload' && (
            <div className="space-y-3">
              <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : resumeText
                      ? 'border-green-500/40 bg-green-500/5'
                      : 'border-border hover:border-primary/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                {extracting ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : resumeText ? (
                  <>
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden />
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">Resume extracted</p>
                    <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Drop your PDF here</p>
                    <p className="text-xs text-muted-foreground">or click to browse (PDF, max 5 MB)</p>
                  </>
                )}
              </div>

              {extractError && (
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">{extractError}</p>
                </div>
              )}

              {/* Paste fallback */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or paste text</span>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume content here…"
                aria-label="Resume text"
                className="w-full h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}

          {/* Select from Profile Panel */}
          {resumeSource === 'profile' && (
            <div className="space-y-3">
              {loadingResumes ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border p-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading your resumes…</span>
                </div>
              ) : profileResumes.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border p-6">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">No resumes found</p>
                    <p className="text-xs text-muted-foreground">
                      Upload a resume in{' '}
                      <Link href="/dashboard/resumes" className="text-primary underline">
                        My resumes
                      </Link>{' '}
                      first, or upload a PDF above.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {profileResumes.map((resume) => (
                    <button
                      key={resume.id}
                      type="button"
                      onClick={() => handleSelectProfileResume(resume)}
                      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        selectedResumeId === resume.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{resume.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {resume.text_content ? 'Text ready' : 'Upload PDF to use'}
                          {' · '}
                          {formatDate(resume.uploaded_at)}
                        </p>
                      </div>
                      {selectedResumeId === resume.id && (
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Show inline upload if selected resume has no text */}
              {selectedResumeId && extractError && (
                <div className="space-y-2">
                  <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 cursor-pointer transition-colors ${
                      dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                    {extracting ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Drop the PDF for this resume, or click to browse
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resume text preview (when text is loaded from any source) */}
          {resumeSource !== 'none' && resumeText && (
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">
                  <ClipboardPaste className="inline h-3 w-3 mr-1" />
                  Resume text loaded (<span className="tabular-nums">{resumeText.length.toLocaleString()}</span> characters)
                </p>
                <button
                  type="button"
                  onClick={() => { setResumeText(''); setSelectedResumeId(null) }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {resumeText.slice(0, 300)}{resumeText.length > 300 ? '…' : ''}
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleStart}
          disabled={starting || (role === 'Custom' && !customRole.trim())}
          className="w-full"
          size="lg"
          data-tour="ai-mock-setup-start"
        >
          {starting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Start interview</>
          )}
        </Button>
      </Card>
    </div>
  )
}
