'use client'
import { formatDate } from '@/lib/format-datetime'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Brain, ArrowLeft, Loader2, FileText, Sparkles, Upload,
  CheckCircle, AlertCircle, ChevronDown, ClipboardPaste, User
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

type ResumeSource = 'none' | 'upload' | 'profile'

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
        const data = await res.json()
        setProfileResumes(data)
      }
    } catch { /* silent */ }
    setLoadingResumes(false)
  }, [])

  useEffect(() => {
    if (resumeSource === 'profile' && profileResumes.length === 0 && !loadingResumes) {
      fetchResumes()
    }
  }, [resumeSource, profileResumes.length, loadingResumes, fetchResumes])

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
    if (source === 'none') {
      setResumeText('')
      setSelectedResumeId(null)
    }
  }

  const handleStart = async () => {
    if (!effectiveRole) {
      setError('Please select or enter a role.')
      return
    }
    setStarting(true)
    setError('')

    try {
      const res = await fetch('/api/interviews/ai-mock/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeText.trim() || undefined,
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
    { value: 'none', label: 'None', icon: <FileText className="h-4 w-4" /> },
    { value: 'upload', label: 'Upload PDF', icon: <Upload className="h-4 w-4" /> },
    { value: 'profile', label: 'From profile', icon: <User className="h-4 w-4" /> },
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
          <div className="flex rounded-xl border border-border bg-muted/50 p-0.5">
            {resumeSourceOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSourceChange(opt.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
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

          {/* Upload PDF Panel */}
          {resumeSource === 'upload' && (
            <div className="space-y-3">
              <div
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
                  <div
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
