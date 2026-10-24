'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Loader2, Bookmark, CheckCircle2, ChevronDown, ChevronRight, Code2, Play, Send, Sparkles, XCircle, Sun, Moon, MoreVertical, MessageSquare, Bug, Lightbulb, HelpCircle, Pause } from 'lucide-react'
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { SkeletonCard, SkeletonButton, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { useToast } from '@/lib/toast-context'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { SmartHintsPanel } from '@/components/ai/smart-hints-panel'
import { ProctorMonitor } from '@/components/ai/proctor-monitor'
import { AnalysisPanel } from '@/components/ai/analysis-panel'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Illustration } from '@/components/illustrations/spot'
import { UnlockPackButton } from '../unlock-pack-button'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'
import { isSubmitEnter } from '@/lib/keyboard'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

interface Problem {
  id: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
  statement_md: string
  input_format?: string | null
  output_format?: string | null
  constraints?: string | null
  example_explanation?: string | null
  test_cases: Array<{ id: string; stdin: string; expected_stdout: string; is_sample: boolean }>
  hidden_test_count: number
  starter_code: Record<string, string>
  time_limit_ms: number
}

interface RunResult {
  test_id: string
  passed: boolean
  is_sample: boolean
  stdout?: string
  expected?: string
  stderr?: string
  error?: string
  time_ms?: number
}

interface RunResponse {
  mode: 'run' | 'submit'
  status: string
  score: number
  passed_tests: number
  total_tests: number
  total_time_ms?: number
  stderr_excerpt?: string | null
  results: RunResult[]
  submissionId: string | null
}

interface SubmissionRow {
  id: string
  language: string
  status: string
  score: number
  passed_tests: number
  total_tests: number
  total_time_ms?: number
  created_at: string
}

interface DiscussionRow {
  id: string
  user_name: string
  content: string
  parent_id: string | null
  created_at: string
}

const TOP_LANGUAGES = [
  { id: 'python', label: 'Python 3', monaco: 'python' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { id: 'java', label: 'Java', monaco: 'java' },
  { id: 'cpp', label: 'C++', monaco: 'cpp' },
  { id: 'c', label: 'C', monaco: 'c' },
  { id: 'csharp', label: 'C#', monaco: 'csharp' },
  { id: 'go', label: 'Go', monaco: 'go' },
  { id: 'rust', label: 'Rust', monaco: 'rust' },
]

export default function ProblemDetailPage() {
  const apiError = useApiError()
  const { formatDateTime } = useLocaleDates()
  const { t: tr } = useT()
  const gate = usePageGuard('user')
  const router = useRouter()
  const addToast = useToast()
  const { startTour, setTourSeen } = useTour()

  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [packLock, setPackLock] = useState<{ title: string; message: string; pack: { id: string; name: string } | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [bookmarked, setBookmarked] = useState(false)

  const [language, setLanguage] = useState<string>('python')
  const [source, setSource] = useState<string>('')
  
  // Left pane tabs
  const [leftTab, setLeftTab] = useState<'problem' | 'solution' | 'submissions'>('problem')
  // Right pane bottom tabs
  const [rightBottomTab, setRightBottomTab] = useState<'test' | 'custom' | 'results' | 'console' | 'analysis'>('test')

  const [submissionsList, setSubmissionsList] = useState<SubmissionRow[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [problemStats, setProblemStats] = useState<{ acceptance_rate: number | null; total_submissions: number } | null>(null)
  const [discussions, setDiscussions] = useState<DiscussionRow[]>([])
  const [discussionsLoading, setDiscussionsLoading] = useState(false)
  
  const { lockedFeatures } = useLockedFeatures()
  const resultsLocked = lockedFeatures.includes('problems:results')
  const consoleLocked = lockedFeatures.includes('problems:console')
  const analysisLocked = lockedFeatures.includes('problems:analysis')
  
  const [running, setRunning] = useState<'run' | 'submit' | null>(null)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  
  // Feedback modal state
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<'bug' | 'suggestion' | 'feature'>('suggestion')
  const [feedbackContent, setFeedbackContent] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  // Discussion state
  const [newDiscussion, setNewDiscussion] = useState('')
  const [postingDiscussion, setPostingDiscussion] = useState(false)

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // AI Mentor state
  const [aiMentorOpen, setAiMentorOpen] = useState(false)
  const [aiMentorMessage, setAiMentorMessage] = useState('')
  const [aiMentorResponse, setAiMentorResponse] = useState('')
  const [aiMentorLoading, setAiMentorLoading] = useState(false)

  const sourceRef = useRef(source)
  sourceRef.current = source

  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false)
  const [sampleIdx, setSampleIdx] = useState(0)
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customRunning, setCustomRunning] = useState(false)
  const [customOutput, setCustomOutput] = useState<{ stdout: string; stderr: string } | null>(null)
  const [customError, setCustomError] = useState<string | null>(null)
  const feedbackRef = useFocusTrap<HTMLDivElement>(feedbackOpen, () => setFeedbackOpen(false))
  const mentorRef = useFocusTrap<HTMLDivElement>(aiMentorOpen, () => setAiMentorOpen(false))
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!slug) return
    void (async () => {
      try {
        const res = await fetch(`/api/problems/${slug}`, { cache: 'no-store' })
        const json = await res.json()
        if (res.status === 402 && json.code === 'pack_locked') {
          setPackLock({ title: json.problem?.title || tr('practice.lockedProblem'), message: json.error || '', pack: json.pack || null })
          return
        }
        setPackLock(null)
        if (!res.ok) throw new Error(apiError(json, tr('practice.failedToLoadProblem')))
        const p = json as Problem
        setProblem(p)
        const initialLang = TOP_LANGUAGES.find((l) => p.starter_code?.[l.id])?.id || 'python'
        setLanguage(initialLang)
        setSource(p.starter_code?.[initialLang] ?? '// Write your solution here\n')
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [slug, reloadKey])

  useEffect(() => {
    if (!problem) return
    void csrfFetch('/api/user/recently-viewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'problem',
        id: problem.id || problem.slug,
        title: problem.title,
        href: `/dashboard/problems/${problem.slug}`,
      }),
    }).catch(() => {})
    fetch('/api/user/problem-bookmarks', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const items = d.items || []
        setBookmarked(items.some((i: { problemId?: string; slug?: string }) => i.problemId === problem.id || i.slug === problem.slug))
      })
      .catch(() => {})
  }, [problem?.id, problem?.slug, problem?.title])

  const submitFeedback = async () => {
    if (!feedbackContent.trim()) return
    setFeedbackSubmitting(true)
    try {
      // API accepts 'bug' | 'complaint' | 'suggestion' | 'other' — map UI-only 'feature' to 'suggestion'.
      const res = await csrfFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType === 'feature' ? 'suggestion' : feedbackType,
          content: `[Problem: ${problem?.title || slug}] ${feedbackContent}`,
          source: 'problems',
        }),
      })
      if (!res.ok) {
        let errMsg = `Submit failed (${res.status})`
        try {
          const data = (await res.json()) as { error?: unknown }
          if (typeof data?.error === 'string') errMsg = data.error
        } catch { /* non-JSON body — keep status message */ }
        throw new Error(errMsg)
      }
      setFeedbackOpen(false)
      setFeedbackContent('')
      addToast({ type: 'success', title: tr('practice.thankYouForYourFeedback') })
    } catch (e) {
      addToast({ type: 'error', title: tr('practice.failedToSubmitFeedback'), message: e instanceof Error ? e.message : undefined })
    }
    setFeedbackSubmitting(false)
  }

  // Timer functions
  const startTimer = () => {
    if (timerRunning) return
    setTimerRunning(true)
    timerRef.current = setInterval(() => {
      setTimerSeconds(s => s + 1)
    }, 1000)
  }

  const stopTimer = () => {
    setTimerRunning(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const resetTimer = () => {
    stopTimer()
    setTimerSeconds(0)
  }

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // AI Mentor function
  const askAiMentor = async () => {
    if (!aiMentorMessage.trim() || !problem) return
    setAiMentorLoading(true)
    setAiMentorResponse('')
    try {
      const res = await csrfFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: tr('practice.youAreACodingMentorHelp3a8', { title: problem.title, statement_md: problem.statement_md, aiMentorMessage }),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAiMentorResponse(data.response || data.message || 'No response received.')
      } else {
        setAiMentorResponse('Sorry, I could not process your request. Please try again.')
      }
    } catch {
      setAiMentorResponse('Network error. Please try again.')
    }
    setAiMentorLoading(false)
  }

  // Post discussion function
  const postDiscussion = async () => {
    if (!newDiscussion.trim() || !slug) return
    setPostingDiscussion(true)
    try {
      const res = await csrfFetch(`/api/problems/${slug}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newDiscussion }),
      })
      if (res.ok) {
        setNewDiscussion('')
        // Refresh discussions
        const dRes = await fetch(`/api/problems/${slug}/discussions`)
        const dData = await dRes.json()
        setDiscussions(dData.discussions || [])
      }
    } catch {}
    setPostingDiscussion(false)
  }

  useEffect(() => {
    if (!slug) return
    void (async () => {
      try {
        const res = await fetch(`/api/problems/${slug}/stats`)
        if (res.ok) setProblemStats(await res.json())
      } catch {}
    })()
  }, [slug])

  useEffect(() => {
    if (leftTab !== 'submissions' || !slug) return
    setSubmissionsLoading(true)
    fetch(`/api/submissions?problem_slug=${encodeURIComponent(slug)}&limit=30`)
      .then((r) => r.json())
      .then((j) => setSubmissionsList(j.submissions ?? []))
      .catch(() => setSubmissionsList([]))
      .finally(() => setSubmissionsLoading(false))
  }, [leftTab, slug])

  // Fetch discussions when opening the accordion (mocked via useEffect for now)
  useEffect(() => {
    if (!slug) return
    setDiscussionsLoading(true)
    fetch(`/api/problems/${encodeURIComponent(slug)}/discussions`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setDiscussions(j.discussions ?? []))
      .catch(() => setDiscussions([]))
      .finally(() => setDiscussionsLoading(false))
  }, [slug])

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Gated on problem load so the anchored landmarks exist on first paint.
  useEffect(() => {
    if (gate.ready && problem && !loadError) {
      const problemDetailTour: TourStep[] = [
        {
          target: '[data-tour="problem-detail-header"]',
          title: tr('practice.problemAtAGlance'),
          description: tr('practice.titleDifficultyAndQuickActionsLive30d'),
          position: 'bottom',
        },
        {
          target: '[data-tour="problem-detail-actions"]',
          title: tr('practice.runThenSubmit'),
          description: tr('practice.compileAgainstSampleTestsFirstThenca2'),
          position: 'top',
        },
        {
          target: '[data-tour="problem-detail-statement"]',
          title: tr('practice.readAndSolve'),
          description: tr('practice.studyTheStatementAndSamplesHeree95'),
          position: 'right',
        },
      ]
      autoPlayPageTour('problem-detail', problemDetailTour)}
  }, [gate.ready, problem, loadError, startTour, setTourSeen])

  function onChangeLanguage(next: string) {
    setLanguage(next)
    const newCode = problem?.starter_code?.[next]
    if (newCode) {
      setSource(newCode)
    } else {
      setSource(`// ${TOP_LANGUAGES.find(l => l.id === next)?.label || next} solution\n\n`)
    }
    setResult(null)
    setAnalysis(null)
  }

  async function runCustom() {
    if (!sourceRef.current.trim()) {
      setCustomError(tr('practice.writeSomeCodeFirst'))
      return
    }
    setCustomRunning(true)
    setCustomError(null)
    setCustomOutput(null)
    try {
      const res = await csrfFetch('/api/execute-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, source: sourceRef.current, stdin: customInput }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; result?: { run?: { stdout?: string; stderr?: string }; compile?: { stderr?: string } } }
      if (!res.ok || !j.result) throw new Error(j.error || (res.status === 429 ? tr('practice.tooManyRunsWaitAMoment3aa') : tr('practice.couldntRunYourCode')))
      setCustomOutput({ stdout: j.result.run?.stdout ?? '', stderr: j.result.compile?.stderr || j.result.run?.stderr || '' })
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : tr('practice.couldntRunYourCode'))
    } finally {
      setCustomRunning(false)
    }
  }

  async function execute(mode: 'run' | 'submit') {
    if (!problem) return
    setRunning(mode)
    setResult(null)
    setRightBottomTab('results')
    try {
      const res = await csrfFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_slug: problem.slug,
          language,
          source_code: sourceRef.current,
          mode,
        }),
      })
      const json = (await res.json()) as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || (res.status === 429 ? tr('practice.tooManyRequestsWaitAMoment928') : tr('practice.somethingWentWrongStatusPleaseTryb1e', { status: res.status })))
      setResult(json)
      if (mode === 'submit') {
        setAnalysisLoading(true)
        csrfFetch('/api/ai/code-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: sourceRef.current,
            language,
            problem_title: problem.title,
            passed_tests: json.passed_tests,
            total_tests: json.total_tests,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setAnalysis(j))
          .catch(() => null)
          .finally(() => setAnalysisLoading(false))
      }
    } catch (e) {
      setResult({
        mode, status: 'error', score: 0, passed_tests: 0, total_tests: 0,
        stderr_excerpt: e instanceof Error ? e.message : String(e),
        results: [], submissionId: null,
      })
    } finally {
      setRunning(null)
    }
  }

  const difficultyTone = useMemo(() => {
    if (!problem) return ''
    return problem.difficulty === 'easy'
      ? 'text-green-700 dark:text-green-400 bg-green-500/10'
      : problem.difficulty === 'medium'
        ? 'text-orange-700 dark:text-orange-400 bg-orange-500/10'
        : 'text-red-700 dark:text-red-400 bg-red-500/10'
  }, [problem])

  // Keyboard shortcuts listed in the information panel. Capture phase so they
  // work inside Monaco too (it would otherwise swallow Ctrl+Enter).
  const executeRef = useRef<(mode: 'run' | 'submit') => void>(() => {})
  executeRef.current = (mode) => { if (running === null) void execute(mode) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        executeRef.current(e.shiftKey ? 'submit' : 'run')
      } else if (e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault()
        setIsInfoPanelOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!gate.ready) return null

  if (packLock) {
    return (
      <div className="flex items-center justify-center p-6 py-20">
        <div className="max-w-md space-y-3 rounded-3xl border border-border/70 bg-card p-6 text-center">
          <Illustration name="locked" className="mx-auto w-36" />
          <h1 className="text-lg font-semibold text-foreground">{packLock.title}</h1>
          <p className="text-sm text-muted-foreground">{packLock.message}</p>
          {packLock.pack ? (
            <UnlockPackButton pack={packLock.pack} size="default" className="gap-2" onUnlocked={() => setReloadKey((k) => k + 1)} />
          ) : null}
          <Link href="/dashboard/problems" className="flex items-center justify-center gap-1 text-sm text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden />{' '}{tr('practice.backToProblems')}</Link>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center p-6 py-20">
        <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-6">
          <h2 className="text-lg font-semibold text-destructive mb-1">{tr('practice.couldNotLoadProblem')}</h2>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1) }}>{tr('common.tryAgain')}</Button>
            <Link href="/dashboard/problems" className="inline-flex items-center gap-1 text-primary text-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden />{' '}{tr('practice.backToProblems')}</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="h-dvh flex flex-col">
        <header className="flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          <div className="h-8 w-8 bg-muted/50 rounded animate-pulse" />
          <div className="h-5 w-48 bg-muted/60 rounded animate-pulse" />
          <div className="h-8 w-8 bg-muted/50 rounded animate-pulse" />
        </header>
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <section className="lg:w-[45%] border-b lg:border-b-0 lg:border-r border-border p-5 space-y-6">
            <SkeletonText lines={8} />
            <SkeletonCard />
          </section>
          <section className="flex-1 flex flex-col min-w-0 bg-muted/5">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
              <div className="h-8 w-32 bg-muted/50 rounded animate-pulse" />
            </div>
            <div className="flex-1 min-h-75 bg-[#1e1e1e] animate-pulse" />
            <div className="h-55 border-t border-border bg-card p-4 space-y-3">
              <SkeletonText lines={3} />
            </div>
          </section>
        </div>
      </div>
    )
  }

  const samples = problem.test_cases.filter((t) => t.is_sample)
  const activeSample = samples[sampleIdx] ?? samples[0] ?? problem.test_cases[0]

  // Header secondary actions — inline on md+ screens, inside the collapsible menu below md.
  const headerSecondaryActions = (
    <>
      <button onClick={() => { setFeedbackType('feature'); setFeedbackOpen(true) }} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{tr('practice.requestAFeature')}</button>
      <div className="flex items-center gap-1">
        <button onClick={() => { setFeedbackType('bug'); setFeedbackOpen(true) }} aria-label={tr('practice.reportBug')} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors group relative">
          <Bug className="h-4 w-4" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">{tr('practice.reportBug')}</div>
        </button>
        <button onClick={() => { setFeedbackType('suggestion'); setFeedbackOpen(true) }} aria-label={tr('practice.suggestIdea')} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors group relative">
          <Lightbulb className="h-4 w-4" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-foreground text-background text-[10px] rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">{tr('practice.suggestIdea')}</div>
        </button>
      </div>

      <div className="flex bg-muted rounded-full p-1 border border-border/50">
        <button onClick={() => setIsDark(false)} aria-label={tr('practice.lightEditorTheme')} aria-pressed={!isDark} className={`p-1 max-md:min-h-10 max-md:min-w-10 rounded-full flex items-center justify-center ${!isDark ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Sun className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setIsDark(true)} aria-label={tr('practice.darkEditorTheme')} aria-pressed={isDark} className={`p-1 max-md:min-h-10 max-md:min-w-10 rounded-full flex items-center justify-center ${isDark ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Moon className="h-3.5 w-3.5" />
        </button>
      </div>

       <button onClick={() => setIsInfoPanelOpen(true)} aria-label={tr('practice.keyboardShortcutsAndHelp')} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
         <HelpCircle className="h-4 w-4" />
       </button>

       {/* AI Mentor Button */}
       <button onClick={() => setAiMentorOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
         <Sparkles className="h-3.5 w-3.5" />{tr('practice.askAi')}</button>

       {/* Functional Timer */}
       <div className="flex items-center gap-1.5 font-mono text-sm font-semibold bg-muted/50 px-3 py-1.5 rounded-md border border-border/50">
         <AnimatedIcon name="clock" className="text-primary" hover={false} trigger={timerRunning} />
         <span className="text-foreground tabular-nums">{formatTimer(timerSeconds)}</span>
         <button onClick={timerRunning ? stopTimer : startTimer} aria-label={timerRunning ? tr('practice.pauseTimer') : tr('practice.startTimer')} className="ml-1 p-0.5 max-md:min-h-10 max-md:min-w-10 flex items-center justify-center hover:bg-muted rounded">
           {timerRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
         </button>
         <button onClick={resetTimer} aria-label={tr('practice.resetTimer')} className="p-0.5 max-md:min-h-10 max-md:min-w-10 flex items-center justify-center hover:bg-muted rounded">
           <AnimatedIcon name="refresh" size={12} />
         </button>
       </div>

      <Button variant="outline" size="sm" className="rounded-md border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950" onClick={() => router.push('/dashboard/problems')}>{tr('practice.exit')}</Button>
    </>
  )
  return (
    <div className="h-dvh flex flex-col md:overflow-hidden bg-background">
      <ProctorMonitor sessionKind="problem" sessionId={problem.slug} captureInterval={30000} blockKeyboardShortcuts lockdownBrowser detectFace />

      {/* Top Header */}
      <header className="flex items-center justify-between gap-2 px-4 h-14 border-b border-border bg-card shrink-0" data-tour="problem-detail-header">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => router.push('/dashboard/problems')} aria-label={tr('practice.backToProblems')} className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
             <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 truncate font-bold text-foreground text-base" title={problem.title}>{problem.title}</h1>
          <button aria-label={tr('practice.toggleBookmark')}
            type="button"
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title={bookmarked ? tr('practice.removeBookmark') : tr('practice.bookmarkQuestion')}
            onClick={() => {
              const next = !bookmarked
              setBookmarked(next)
              void csrfFetch('/api/user/problem-bookmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  problemId: problem.id || problem.slug,
                  slug: problem.slug,
                  title: problem.title,
                  difficulty: problem.difficulty,
                }),
              })
                .then(async (r) => {
                  const d = await r.json()
                  if (r.ok) setBookmarked(!!d.saved)
                })
                .catch(() => setBookmarked(!next))
            }}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
        </div>
        
        <div className="hidden md:flex items-center gap-5">
          {headerSecondaryActions}
        </div>
        <button
          type="button"
          onClick={() => setHeaderMenuOpen((v) => !v)}
          aria-label={tr('practice.moreActions')}
          aria-expanded={headerMenuOpen}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </header>
      {headerMenuOpen && (
        <div className="border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {headerSecondaryActions}
          </div>
        </div>
      )}

      {/* 2-pane split */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        
        {/* LEFT PANE */}
        <section className={`lg:w-[45%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0 ${editorExpanded ? 'hidden' : ''}`} data-tour="problem-detail-statement">
           {/* Tabs */}
           <div className="flex items-center px-4 pt-2 border-b border-border bg-muted/10 shrink-0 gap-6">
              <button onClick={() => setLeftTab('problem')} className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${leftTab === 'problem' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tr('practice.problem')}</button>
              <button onClick={() => setLeftTab('solution')} className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${leftTab === 'solution' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tr('practice.solution')}</button>
              <button onClick={() => setLeftTab('submissions')} className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${leftTab === 'submissions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tr('practice.submissions')}</button>
           </div>
           
           {/* Tab Content */}
           <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
             {leftTab === 'problem' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                     <span className={`text-xs font-bold px-2 py-0.5 rounded capitalize ${difficultyTone}`}>{problem.difficulty}</span>
                  </div>
                  
                  <div className="prose prose-sm dark:prose-invert max-w-none mb-8 text-foreground/90">
                    <Markdownish text={problem.statement_md} />
                  </div>

                  {problem.test_cases.length > 0 && (
                    <div className="space-y-4 mb-8">
                       <h3 className="text-base font-semibold text-foreground">{tr('practice.sampleTestCases')}</h3>
                       {problem.test_cases.filter(t => t.is_sample).map((t, i) => (
                         <div key={t.id} className="rounded-xl border border-border overflow-hidden bg-card/40">
                            <div className="bg-muted/40 px-4 py-2 border-b border-border flex justify-between items-center text-sm font-semibold">{tr('practice.testCase')}{' '}{i+1}
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-border gap-4">
                               <div className="sm:pr-2">
                                  <div className="text-xs text-muted-foreground mb-1.5 font-semibold">{tr('practice.input2')}</div>
                                  <pre className="text-sm font-mono whitespace-pre-wrap text-foreground bg-muted/20 p-2 rounded-lg border border-border/50">{t.stdin}</pre>
                               </div>
                               <div className="sm:pl-4">
                                  <div className="text-xs text-muted-foreground mb-1.5 font-semibold">{tr('practice.output2')}</div>
                                  <pre className="text-sm font-mono whitespace-pre-wrap text-foreground bg-muted/20 p-2 rounded-lg border border-border/50">{t.expected_stdout}</pre>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {/* Accordions */}
                  <div className="space-y-2 border-t border-border pt-4">
                     <details className="group border border-border rounded-lg bg-card overflow-hidden">
                        <summary className="flex items-center justify-between p-3 font-semibold text-sm cursor-pointer hover:bg-muted/30 transition-colors">{tr('practice.companies')}{' '}<ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="p-3 pt-0 text-sm text-muted-foreground border-t border-border bg-muted/10">
                           <div className="flex gap-2 mt-2">
                              <span className="px-2 py-1 rounded bg-background border text-xs font-semibold">{tr('practice.tcs')}</span>
                              <span className="px-2 py-1 rounded bg-background border text-xs font-semibold">{tr('practice.wipro')}</span>
                           </div>
                        </div>
                     </details>
                     <details className="group border border-border rounded-lg bg-card overflow-hidden">
                        <summary className="flex items-center justify-between p-3 font-semibold text-sm cursor-pointer hover:bg-muted/30 transition-colors">{tr('practice.topics')}{' '}<ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="p-3 pt-0 text-sm text-muted-foreground border-t border-border bg-muted/10">
                           <div className="flex gap-2 flex-wrap mt-2">
                              {problem.topics.map(t => (
                                <span key={t} className="px-2 py-1 rounded bg-background border text-xs font-semibold">{t}</span>
                              ))}
                           </div>
                        </div>
                     </details>
                      <details className="group border border-border rounded-lg bg-card overflow-hidden">
                         <summary className="flex items-center justify-between p-3 font-semibold text-sm cursor-pointer hover:bg-muted/30 transition-colors">{tr('practice.discussionChannel')}{' '}<ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                         </summary>
                         <div className="p-3 border-t border-border bg-muted/10 h-80 overflow-y-auto">
                            {discussionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                             discussions.length === 0 ? <p className="text-xs text-muted-foreground">{tr('practice.noDiscussionsYetBeTheFirst375')}</p> :
                             discussions.map(d => (
                               <div key={d.id} className="mb-3 border-b border-border pb-2 last:border-0">
                                  <div className="font-bold text-xs text-foreground flex items-center gap-2"><UserAvatar seed={d.user_name} name={d.user_name} className="h-5 w-5" fallbackClassName="text-[8px]" /> {d.user_name}</div>
                                  <p className="text-xs mt-1 text-foreground/80">{d.content}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(d.created_at)}</p>
                               </div>
                             ))
                            }
                            {/* Discussion input */}
                            <div className="mt-3 pt-3 border-t border-border">
                              <textarea
                                value={newDiscussion}
                                onChange={(e) => setNewDiscussion(e.target.value)}
                                aria-label={tr('practice.startADiscussion')}
                                placeholder={tr('practice.startADiscussion2')}
                                className="w-full h-16 p-2 text-xs rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <Button 
                                size="sm" 
                                className="mt-2 w-full" 
                                onClick={postDiscussion}
                                disabled={!newDiscussion.trim() || postingDiscussion}
                              >
                                {postingDiscussion ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MessageSquare className="h-3 w-3 mr-1" />}{tr('practice.post')}</Button>
                            </div>
                         </div>
                      </details>
                  </div>
                </>
             )}
             
             {leftTab === 'solution' && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
                   <Code2 className="h-10 w-10 text-muted-foreground" />
                   <div>
                     <p className="font-bold">{tr('practice.officialSolutionLocked')}</p>
                     <p className="text-xs text-muted-foreground">{tr('practice.solveTheProblemFirstToViewe83')}</p>
                   </div>
                </div>
             )}

             {leftTab === 'submissions' && (
                <div>
                   {submissionsLoading ? <Loader2 className="h-5 w-5 animate-spin mt-10" /> :
                    submissionsList.length === 0 ? <p className="text-sm text-center text-muted-foreground mt-10">{tr('practice.noSubmissionsYet')}</p> :
                    <div className="space-y-2">
                       {submissionsList.map(s => (
                         <div key={s.id} className={`p-3 rounded-xl border text-sm flex justify-between items-center ${s.status === 'accepted' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                            <div className="flex flex-col gap-1">
                               <div className={`font-bold flex items-center gap-1.5 ${s.status === 'accepted' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                 {s.status === 'accepted' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                 {s.status}
                               </div>
                               <div className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</div>
                            </div>
                            <div className="text-right flex flex-col gap-1">
                               <div className="font-bold text-foreground">{s.language}</div>
                               <div className="text-xs text-muted-foreground">{s.passed_tests}/{s.total_tests} passed • {s.total_time_ms}ms</div>
                            </div>
                         </div>
                       ))}
                    </div>
                   }
                </div>
             )}
           </div>
        </section>

        {/* RIGHT PANE */}
        <section className="flex-1 flex flex-col min-w-0 bg-muted/5">
           
           {/* Editor Toolbar */}
           <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card shrink-0">
             <div className="flex items-center gap-2">
               <select
                 value={language}
                 onChange={(e) => onChangeLanguage(e.target.value)}
                 aria-label={tr('common.language')}
                 className="bg-muted border border-border/50 rounded-md px-3 h-8 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
               >
                 {TOP_LANGUAGES.map((l) => (
                   <option key={l.id} value={l.id}>{l.label}</option>
                 ))}
               </select>
             </div>
             <div className="flex items-center gap-2">
                <Button aria-label={editorExpanded ? tr('practice.showProblemStatement') : tr('practice.expandEditor')} aria-pressed={editorExpanded} onClick={() => setEditorExpanded((v) => !v)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"><AnimatedIcon name={editorExpanded ? 'full-screen-exit' : 'full-screen'} /></Button>
             </div>
           </div>

           {/* Editor */}
           <div className="flex-1 min-h-75">
             <Editor
               height="100%"
               language={TOP_LANGUAGES.find(l => l.id === language)?.monaco || 'plaintext'}
               theme={isDark ? 'vs-dark' : 'vs'}
               value={source}
               onChange={(v) => setSource(v ?? '')}
               options={{
                 fontSize: 14,
                 minimap: { enabled: false },
                 automaticLayout: true,
                 scrollBeyondLastLine: false,
                 padding: { top: 16 },
                 lineHeight: 24,
                 fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
               }}
             />
           </div>

           {/* Console / Output Panel */}
           <div className={`border-t border-border bg-card flex flex-col shrink-0 ${outputExpanded ? 'h-[60vh]' : 'min-h-55'}`}>
              
              <div className="flex items-center justify-between border-b border-border/50 px-2 bg-muted/20">
                 <div className="flex gap-1 pt-1">
                    <button onClick={() => setRightBottomTab('test')} className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${rightBottomTab === 'test' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>{tr('practice.test')}</button>
                    <button onClick={() => setRightBottomTab('custom')} className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${rightBottomTab === 'custom' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>{tr('practice.customTest')}</button>
                    <button onClick={() => setRightBottomTab('results')} className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${rightBottomTab === 'results' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>{tr('practice.results')}</button>
                    <button onClick={() => setRightBottomTab('analysis')} className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${rightBottomTab === 'analysis' ? 'border-primary text-primary bg-background' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}><Sparkles className="h-3 w-3 inline mr-1" />{' '}{tr('practice.aiAnalysis')}</button>
                 </div>
                 <div className="flex items-center text-muted-foreground gap-2 pr-2">
                    <button type="button" aria-label={outputExpanded ? tr('practice.shrinkPanel') : tr('practice.expandPanel')} aria-pressed={outputExpanded} onClick={() => setOutputExpanded((v) => !v)} className="p-1 hover:bg-muted rounded"><AnimatedIcon name={outputExpanded ? 'full-screen-exit' : 'full-screen'} size={14} /></button>
                 </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                 {rightBottomTab === 'test' && (
                    <div className="space-y-4">
                       <div className="flex gap-2">
                         {samples.map((t, i) => (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={i === sampleIdx}
                              onClick={() => setSampleIdx(i)}
                              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${i === sampleIdx ? 'bg-primary/10 text-primary' : 'bg-muted hover:bg-muted/80'}`}
                            >{tr('practice.testCase')}{' '}{i+1}
                            </button>
                         ))}
                       </div>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-muted/10 p-4 rounded-xl border border-border/50">
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{tr('practice.input2')}</h4>
                            <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">{activeSample?.stdin}</pre>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">{tr('practice.expectedOutput')}</h4>
                            <pre className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">{activeSample?.expected_stdout}</pre>
                          </div>
                       </div>
                    </div>
                 )}
                 {rightBottomTab === 'custom' && (
                    <div className="space-y-3">
                       <label htmlFor="custom-stdin" className="text-xs font-semibold text-muted-foreground">{tr('practice.yourInputStdin')}</label>
                       <textarea
                         id="custom-stdin"
                         value={customInput}
                         onChange={(e) => setCustomInput(e.target.value)}
                         rows={4}
                         className="w-full rounded-lg border border-input bg-background p-3 font-mono text-sm"
                       />
                       <Button type="button" size="sm" variant="outline" onClick={() => void runCustom()} disabled={customRunning}>
                         {customRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : <Play className="h-4 w-4 mr-2 text-primary" aria-hidden />}{tr('practice.runWithThisInput')}</Button>
                       {customError ? <p role="alert" className="text-sm text-destructive">{customError}</p> : null}
                       {customOutput ? (
                         <div className="space-y-2">
                           <h4 className="text-xs font-semibold text-muted-foreground">{tr('practice.output2')}</h4>
                           <pre className="text-sm font-mono whitespace-pre-wrap break-all rounded-lg border border-border/50 bg-muted/20 p-2 text-foreground">{customOutput.stdout || '(no output)'}</pre>
                           {customOutput.stderr ? <pre className="text-sm font-mono whitespace-pre-wrap break-all rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-destructive">{customOutput.stderr}</pre> : null}
                         </div>
                       ) : null}
                    </div>
                 )}
                 {rightBottomTab === 'results' && (
                    <ResultsPanel result={result} running={running !== null} />
                 )}
                 {rightBottomTab === 'analysis' && (
                    <AnalysisPanel analysis={analysis} loading={analysisLoading} hasSubmitted={!!result && result.mode === 'submit'} />
                 )}
              </div>

              <div className="flex items-center justify-end gap-3 p-3 border-t border-border/50 bg-background/50 backdrop-blur" data-tour="problem-detail-actions">
                 <Button 
                   variant="outline" 
                   onClick={() => execute('run')}
                   disabled={running !== null}
                   className="font-bold border-border/80 h-9"
                 >
                   {running === 'run' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2 text-primary" />}{tr('practice.saveAndRun')}</Button>
                 <Button 
                   onClick={() => execute('submit')}
                   disabled={running !== null}
                   className="font-semibold h-9"
                 >
                   {running === 'submit' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}{tr('practice.submitCode')}</Button>
              </div>

           </div>
        </section>

        {/* INFORMATION SIDE PANEL */}
        {isInfoPanelOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setIsInfoPanelOpen(false)} aria-hidden="true" />
        )}
        {isInfoPanelOpen && (
           <div className="relative z-40 lg:z-auto w-full sm:w-[320px] lg:w-100 border-l border-border bg-card flex flex-col shrink-0 animate-in slide-in-from-right">
              <div className="flex items-center justify-between px-4 py-4 border-b border-border/50">
                 <h2 className="text-lg font-semibold text-foreground">{tr('practice.information')}</h2>
                 <button aria-label={tr('practice.closeInformationPanel')} onClick={() => setIsInfoPanelOpen(false)} className="text-muted-foreground hover:text-foreground"><XCircle className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center px-4 pt-2 border-b border-border bg-muted/10 shrink-0">
                 <h3 className="pb-2 text-sm font-semibold border-b-2 border-primary text-primary">{tr('practice.keyboardShortcuts')}</h3>
              </div>
              <div className="p-4 overflow-y-auto">
                 <p className="text-xs font-semibold text-muted-foreground mb-4 leading-relaxed">{tr('practice.useTheseShortcutsAnywhereOnThis626')}</p>
                 <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/50">
                       <span className="text-xs font-semibold text-muted-foreground">{tr('practice.saveAndRun')}</span>
                       <kbd className="text-[10px] font-mono font-bold px-2 py-1 bg-muted rounded">Ctrl + Enter</kbd>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/50">
                       <span className="text-xs font-semibold text-muted-foreground">{tr('practice.submitCode')}</span>
                       <kbd className="text-[10px] font-mono font-bold px-2 py-1 bg-muted rounded">Ctrl + Shift + Enter</kbd>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/50">
                       <span className="text-xs font-semibold text-muted-foreground">{tr('practice.showOrHideThisPanel')}</span>
                       <kbd className="text-[10px] font-mono font-bold px-2 py-1 bg-muted rounded">Ctrl + Shift + H</kbd>
                    </div>
                 </div>
              </div>
           </div>
         )}

          {/* Feedback Modal */}
          {feedbackOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setFeedbackOpen(false)}>
              <div ref={feedbackRef} role="dialog" aria-modal="true" aria-labelledby="problem-feedback-title" className="bg-background rounded-3xl border p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <h3 id="problem-feedback-title" className="text-lg font-semibold mb-4">
                  {feedbackType === 'bug' ? tr('practice.reportABug') : feedbackType === 'feature' ? tr('practice.requestAFeature') : tr('practice.suggestAnIdea')}
                </h3>
                <textarea
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  aria-label={tr('practice.yourFeedback')}
                  placeholder={tr('practice.describeYourFeedback')}
                  className="w-full h-32 p-3 text-sm rounded-lg border border-input bg-background resize-none"
                />
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(false)}>{tr('common.cancel')}</Button>
                  <Button size="sm" onClick={submitFeedback} disabled={feedbackSubmitting || !feedbackContent.trim()}>
                    {feedbackSubmitting ? 'Submitting...' : tr('common.submit')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* AI Mentor Modal */}
          {aiMentorOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAiMentorOpen(false)}>
              <div ref={mentorRef} role="dialog" aria-modal="true" aria-labelledby="problem-mentor-title" className="bg-background rounded-3xl border p-6 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                  <h3 id="problem-mentor-title" className="text-lg font-semibold">{tr('practice.aiMentor')}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">{tr('practice.askQuestionsAboutTheProblemThe6ce')}</p>
                <div className="flex-1 overflow-y-auto mb-4 p-3 bg-muted/30 rounded-lg min-h-[100px]">
                  {aiMentorResponse ? (
                    <p className="text-sm whitespace-pre-wrap">{aiMentorResponse}</p>
                  ) : aiMentorLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">{tr('practice.askMeAnythingAboutThisProblem')}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiMentorMessage}
                    onChange={(e) => setAiMentorMessage(e.target.value)}
                    aria-label={tr('practice.askTheAiMentor')}
                    onKeyDown={(e) => isSubmitEnter(e) && askAiMentor()}
                    placeholder={tr('practice.eGHowShouldIApproache96')}
                    className="flex-1 p-2 text-sm rounded-lg border border-input bg-background"
                  />
                  <Button aria-label={tr('practice.askTheAiMentor')} size="sm" onClick={askAiMentor} disabled={aiMentorLoading || !aiMentorMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAiMentorOpen(false)}>{tr('common.close')}</Button>
              </div>
            </div>
          )}

      </div>
    </div>
  )
}

function Markdownish({ text }: { text: string }) {
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm border border-border/50">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
    .replace(/\n\n/g, '</p><p class="mt-4">')
  return (
    <div dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }} />
  )
}

function ResultsPanel({ result, running }: { result: RunResponse | null, running: boolean }) {
  const { t } = useT()
  if (running) return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" />{' '}{t('practice.compilingAndTesting')}</div>
  if (!result) return <p className="text-sm text-muted-foreground p-4 text-center">{t('practice.click')}{' '}<strong>{t('practice.saveAndRun')}</strong>{' '}{t('practice.toRunYourCodeAgainstSampleb93')}</p>
  
  const ok = result.status === 'accepted'
  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-xl border ${ok ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} flex items-center justify-between`}>
         <div className="flex items-center gap-3">
            {ok ? <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" /> : <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />}
            <div>
               <div className={`font-bold text-lg ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{ok ? t('practice.accepted') : t('practice.failed')}</div>
               <div className="text-xs text-muted-foreground font-semibold">{t('practice.passedPassedTestsTotalTestsTest7de', { passed_tests: result.passed_tests, total_tests: result.total_tests })}</div>
            </div>
         </div>
         {result.score != null && (
            <div className="text-right">
               <div className="text-2xl font-black tabular-nums text-foreground">{result.score}%</div>
               <div className="text-xs font-semibold text-muted-foreground">{t('practice.score')}</div>
            </div>
         )}
      </div>

      {result.results.length > 0 && (
         <div className="space-y-3">
           {result.results.map((r, i) => (
             <div key={r.test_id} className={`rounded-xl border ${r.passed ? 'border-border/50 bg-card/40' : 'border-red-500/30 bg-red-500/5'}`}>
                <div className="px-4 py-3 flex items-center justify-between border-b border-border/40">
                   <div className="flex items-center gap-2 font-bold text-sm">
                      {r.passed ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}{t('practice.testCase')}{' '}{i+1} {r.is_sample && <span className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-semibold ml-1 text-muted-foreground">{t('practice.sample')}</span>}
                   </div>
                   <div className="text-xs font-mono tabular-nums text-muted-foreground">{r.time_ms ?? '—'}ms</div>
                </div>
                {!r.passed && (
                   <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                         <div className="text-xs font-semibold text-muted-foreground mb-1">{t('practice.yourOutput')}</div>
                         <pre className="text-sm font-mono bg-red-500/10 text-red-700 dark:text-red-400 p-2 rounded border border-red-500/20 whitespace-pre-wrap">{r.stdout || r.stderr || r.error || '—'}</pre>
                      </div>
                      <div>
                         <div className="text-xs font-semibold text-muted-foreground mb-1">{t('practice.expectedOutput')}</div>
                         <pre className="text-sm font-mono bg-green-500/10 text-green-700 dark:text-green-400 p-2 rounded border border-green-500/20 whitespace-pre-wrap">{r.expected ?? '—'}</pre>
                      </div>
                   </div>
                )}
             </div>
           ))}
         </div>
      )}
    </div>
  )
}
