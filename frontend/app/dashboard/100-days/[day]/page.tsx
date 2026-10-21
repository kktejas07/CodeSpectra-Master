'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Play, Send, Loader2, CheckCircle, AlertCircle, Trophy, ChevronRight, ChevronLeft, BookOpen, Flame } from 'lucide-react'
import { HUNDRED_DAYS, type HundredDayProblem } from '@/lib/100-days-data'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader } from '@/components/app/page-kit'
import { usePageGuard } from '@/lib/use-page-guard'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>,
})

const ALL_LANGUAGES = (t: Translator) => ([
  { id: 'python', label: 'Python 3', monaco: 'python' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { id: 'java', label: 'Java', monaco: 'java' },
  { id: 'cpp', label: 'C++', monaco: 'cpp' },
  { id: 'c', label: 'C', monaco: 'c' },
  { id: 'csharp', label: 'C#', monaco: 'csharp' },
  { id: 'go', label: 'Go', monaco: 'go' },
  { id: 'rust', label: 'Rust', monaco: 'rust' },
  { id: 'ruby', label: 'Ruby', monaco: 'ruby' },
  { id: 'php', label: 'PHP', monaco: 'php' },
  { id: 'swift', label: 'Swift', monaco: 'swift' },
  { id: 'kotlin', label: 'Kotlin', monaco: 'kotlin' },
  { id: 'scala', label: t('practice.scala'), monaco: 'scala' },
  { id: 'dart', label: t('practice.dart'), monaco: 'dart' },
  { id: 'bash', label: t('practice.bash'), monaco: 'shell' },
  { id: 'perl', label: t('practice.perl'), monaco: 'perl' },
  { id: 'haskell', label: t('practice.haskell'), monaco: 'haskell' },
  { id: 'lua', label: t('practice.lua'), monaco: 'lua' },
  { id: 'rscript', label: 'R', monaco: 'r' },
  { id: 'julia', label: t('practice.julia'), monaco: 'julia' },
  { id: 'elixir', label: t('practice.elixir'), monaco: 'elixir' },
  { id: 'clojure', label: t('practice.clojure'), monaco: 'clojure' },
  { id: 'groovy', label: t('practice.groovy'), monaco: 'groovy' },
  { id: 'ocaml', label: t('practice.ocaml'), monaco: 'ocaml' },
  { id: 'erlang', label: t('practice.erlang'), monaco: 'erlang' },
])

interface RunResult {
  passed: boolean; input: string; expected: string
  stdout: string; stderr: string | null; time_ms: number
}
interface RunResponse {
  status: string; passed_tests: number; total_tests: number
  total_time_ms: number; stderr_excerpt: string | null; results: RunResult[]
}

function getCompletedProblems(dayNum: number): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(`100-days-d${dayNum}-completed`)
    return new Set(raw ? JSON.parse(raw) as string[] : [])
  } catch { return new Set() }
}

export default function DayPage() {
  const { t } = useT()
  const gate = usePageGuard('user')

  const params = useParams()
  const router = useRouter()
  const day = parseInt(String(params?.day ?? '0'), 10)
  const dayData = useMemo(() => HUNDRED_DAYS.find(d => d.day === day), [day])

  const [activeProblem, setActiveProblem] = useState<string>('')
  const problem = useMemo(() => dayData?.problems.find(p => p.id === activeProblem) ?? null, [dayData, activeProblem])

  // W4-10: stored choices are read after mount, never in a useState initialiser.
  const [language, setLanguage] = useState('python')
  useEffect(() => {
    try { const v = localStorage.getItem('100-days-language'); if (v) setLanguage(v) } catch { /* storage blocked */ }
  }, [])
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [bottomTab, setBottomTab] = useState<'testcases' | 'results'>('testcases')
  const [completedProblems, setCompletedProblems] = useState<Set<string>>(() => new Set())
  useEffect(() => { setCompletedProblems(getCompletedProblems(day)) }, [day])
  const codeRef = useRef(code)
  codeRef.current = code

  const allDone = dayData ? dayData.problems.length === completedProblems.size : false

  useEffect(() => {
    if (dayData && !activeProblem) setActiveProblem(dayData.problems[0].id)
  }, [dayData, activeProblem])

  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!problem) return
    setCode(problem.starterCode[language] || problem.starterCode.python || '')
    setResult(null)
    setBottomTab('testcases')
  }, [problem, language])

  useEffect(() => {
    setCompletedProblems(getCompletedProblems(day))
    // Merge in what the server recorded (works across devices).
    if (!dayData) return
    const ids = new Set(dayData.problems.map(p => p.id))
    fetch('/api/user/100-days', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data?.solvedProblems)) return
        setCompletedProblems(prev => {
          const next = new Set(prev)
          for (const id of data.solvedProblems as string[]) if (ids.has(id)) next.add(id)
          return next
        })
      })
      .catch(() => {})
  }, [day, dayData])

  if (!dayData || day < 1 || day > 100) {
    return (
      <Card className="rounded-3xl p-6 border-border/70 text-center">
        <p className="text-muted-foreground">{t('practice.dayDayIsntAvailableYetGod53', { day })}</p>
        <Button asChild variant="link" className="h-auto p-0 mt-2"><Link href="/dashboard/100-days">{t('practice.backToOverview')}</Link></Button>
      </Card>
    )
  }

  const nextDay = HUNDRED_DAYS.find(d => d.day === day + 1)
  const prevDay = HUNDRED_DAYS.find(d => d.day === day - 1)

  const execute = async () => {
    if (!problem || !codeRef.current.trim()) return
    setRunning(true)
    setResult(null)
    setBottomTab('results')
    try {
      const res = await csrfFetch('/api/arena/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          source_code: codeRef.current, language,
          test_cases: problem.examples.map(ex => ({ input: ex.input, expected_output: ex.output })),
          mode: 'run',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || t('practice.runFailed'))
      setResult(json)
    } catch (e: any) { setResult({ status: 'error', passed_tests: 0, total_tests: problem.examples.length, total_time_ms: 0, stderr_excerpt: e.message, results: [] }) }
    finally { setRunning(false) }
  }

  const handleSubmit = async () => {
    if (!problem || !codeRef.current.trim()) return
    setSubmitting(true)
    setResult(null)
    setBottomTab('results')
    try {
      const res = await csrfFetch('/api/arena/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          source_code: codeRef.current, language,
          // The server grades sprint problems on its own copy of the examples.
          hundred_days_problem_id: problem.id,
          mode: 'submit',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || t('practice.submitFailed'))
      setResult(json)
      if (json.status === 'accepted') {
        const next = new Set(completedProblems)
        next.add(problem.id)
        setCompletedProblems(next)
        try { localStorage.setItem(`100-days-d${day}-completed`, JSON.stringify([...next])) } catch {}
        if (next.size === dayData.problems.length) {
          try {
            const raw = localStorage.getItem('100-days-completed')
            const daysDone = new Set(raw ? JSON.parse(raw) as number[] : [])
            daysDone.add(day)
            localStorage.setItem('100-days-completed', JSON.stringify([...daysDone]))
          } catch {}
        }
      }
    } catch (e: any) { setResult({ status: 'error', passed_tests: 0, total_tests: problem.examples.length, total_time_ms: 0, stderr_excerpt: e.message, results: [] }) }
    finally { setSubmitting(false) }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <PageHeader
        title={<span className="inline-flex flex-wrap items-center gap-3"><span>{t('practice.day')}{' '}<span className="tabular-nums">{day}</span>: {dayData.theme}</span>{allDone && <Badge variant="success" className="gap-1"><Trophy className="h-3 w-3" />{' '}{t('practice.dayComplete')}</Badge>}</span>}
        description={t('practice.countProblemsTodaySolveThemAll4b4', { count: dayData.problems.length })}
        icon={<Flame />}
        className="mb-0"
        actions={<Button asChild variant="outline" size="sm" className="gap-1"><Link href="/dashboard/100-days"><ArrowLeft className="h-4 w-4" />{' '}{t('practice.allDays')}</Link></Button>}
      />

      {/* Problem tabs */}
      <Tabs value={activeProblem} onValueChange={setActiveProblem}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {dayData.problems.map((p, i) => {
            const done = completedProblems.has(p.id)
            return (
              <TabsTrigger
                key={p.id}
                value={p.id}
                className={`px-3 py-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md ${
                  done ? 'text-green-600 dark:text-green-400' : ''
                }`}
              >
                {done ? <CheckCircle className="h-3 w-3 mr-1" /> : null}
                {i + 1}. {p.title}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {problem && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: problem */}
          <Card className="rounded-3xl p-6 border-border/70 space-y-4 overflow-y-auto max-h-[calc(100vh-14rem)]">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{problem.title}</h2>
              <Badge variant={problem.difficulty === 'easy' ? 'success' : problem.difficulty === 'medium' ? 'warning' : 'danger'}>{problem.difficulty}</Badge>
              {completedProblems.has(problem.id) && <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" />{' '}{t('practice.solved')}</Badge>}
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{t('practice.description')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{problem.description}</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{t('practice.inputFormat')}</h3>
              <p className="text-xs text-muted-foreground">{problem.inputFormat}</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{t('practice.outputFormat')}</h3>
              <p className="text-xs text-muted-foreground">{problem.outputFormat}</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{t('practice.constraints')}</h3>
              <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap wrap-break-word">{problem.constraints}</pre>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground text-sm">{t('practice.examples')}</h3>
              {problem.examples.map((ex, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-muted/30 p-3 font-mono text-xs space-y-1">
                  <p className="text-foreground/80">{t('practice.input')}{' '}<span className="text-foreground">{ex.input || t('practice.empty')}</span></p>
                  <p className="text-foreground/80">{t('practice.output')}{' '}<span className="text-foreground">{ex.output || t('practice.empty')}</span></p>
                  {ex.explanation && <p className="text-muted-foreground mt-1">{ex.explanation}</p>}
                </div>
              ))}
            </div>
          </Card>

          {/* Right: editor + results */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={language}
                onChange={(e) => { const v = e.target.value; setLanguage(v); setResult(null); setBottomTab('testcases'); try { localStorage.setItem('100-days-language', v) } catch {} }}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ALL_LANGUAGES(t).map(l => (<option key={l.id} value={l.id}>{l.label}</option>))}
              </select>
              <div className="flex gap-2 ml-auto">
                <Button onClick={execute} disabled={running || submitting} variant="outline" size="sm" className="gap-1.5">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{' '}{t('practice.run')}</Button>
                <Button onClick={handleSubmit} disabled={running || submitting} size="sm" className="gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{' '}{t('common.submit')}</Button>
              </div>
            </div>

            <div className="h-[400px] rounded-lg border border-border overflow-hidden">
              <Editor
                height="100%"
                language={ALL_LANGUAGES(t).find(l => l.id === language)?.monaco || 'plaintext'}
                theme={isDark ? 'vs-dark' : 'vs'}
                value={code}
                onChange={(v) => setCode(v ?? '')}
                options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, wordWrap: 'on' }}
              />
            </div>

            {/* Bottom panel: Test Cases | Results */}
            <div className="border-t border-border bg-card/20 shrink-0 h-[260px] flex flex-col rounded-lg overflow-hidden">
              <div className="flex items-center gap-1 px-3 pt-2 text-sm">
                <TabBtn current={bottomTab} value="testcases" onClick={setBottomTab}>{t('practice.testCasesCount', { count: problem.examples.length })}</TabBtn>
                <TabBtn current={bottomTab} value="results" onClick={setBottomTab}>
                  {result && !running && !submitting ? (
                    <span className="inline-flex items-center gap-1.5">
                      {result.status === 'accepted' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      )}{t('practice.resultsPassedTestsTotalTests', { passed_tests: result.passed_tests, total_tests: result.total_tests })}</span>
                  ) : (
                    t('practice.results')
                  )}
                </TabBtn>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {bottomTab === 'testcases' && (
                  <TestCasesPanel examples={problem.examples} />
                )}
                {bottomTab === 'results' && (
                  <ResultsPanel result={result} running={running || submitting} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day navigation */}
      <div className="flex justify-between">
        {prevDay ? (
          <Button asChild variant="outline" size="sm"><Link href={`/dashboard/100-days/${prevDay.day}`}><ChevronLeft className="h-4 w-4 mr-1" />{' '}{t('practice.dayDayTheme', { day: prevDay.day, theme: prevDay.theme })}</Link></Button>
        ) : <div />}
        {nextDay ? (
          <Button asChild variant="outline" size="sm"><Link href={`/dashboard/100-days/${nextDay.day}`}>{t('practice.dayDayTheme', { day: nextDay.day, theme: nextDay.theme })}{' '}<ChevronRight className="h-4 w-4 ml-1" /></Link></Button>
        ) : <div />}
      </div>
    </div>
  )
}

function TabBtn({
  current,
  value,
  onClick,
  children,
}: {
  current: string
  value: 'testcases' | 'results'
  onClick: (v: 'testcases' | 'results') => void
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1.5 rounded-t border-b-2 transition text-xs ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function TestCasesPanel({ examples }: { examples: HundredDayProblem['examples'] }) {
  const { t } = useT()
  if (examples.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">{t('practice.noSampleTestCasesAvailable')}</p>
  }
  return (
    <div className="space-y-2">
      {examples.map((ex, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground font-medium">{t('practice.testCase')}{' '}{i + 1}{' '}{t('practice.ofCount', { count: examples.length })}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground mb-0.5 font-medium">{t('practice.input2')}</div>
              <pre className="font-mono whitespace-pre-wrap text-foreground bg-muted/30 rounded p-1.5 text-[11px]">{ex.input || '(empty)'}</pre>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5 font-medium">{t('practice.expectedOutput')}</div>
              <pre className="font-mono whitespace-pre-wrap text-foreground bg-muted/30 rounded p-1.5 text-[11px]">{ex.output || '(empty)'}</pre>
            </div>
          </div>
          {ex.explanation && (
            <p className="mt-2 text-muted-foreground text-[11px]">{ex.explanation}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function ResultsPanel({ result, running }: { result: RunResponse | null; running: boolean }) {
  const { t } = useT()
  if (running) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />{' '}{t('practice.executingOnPiston')}</div>
    )
  }
  if (!result) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">{t('practice.click')}{' '}<strong>{t('practice.run')}</strong>{' '}{t('practice.toTestYourCodeAgainstSample854')}</p>
    )
  }

  const ok = result.status === 'accepted'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${
          ok ? 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400' : 'border-destructive/30 bg-destructive/5 text-destructive'
        }`}>
          {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {ok ? t('practice.allPassed') : result.status.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-muted-foreground">
          {result.passed_tests}/{result.total_tests} passed · {result.total_time_ms}ms
        </span>
      </div>

      {result.results.length > 0 && (
        <div className="space-y-2">
          {result.results.map((r, i) => (
            <div key={i} className={`rounded-xl border p-3 text-xs ${
              r.passed ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
            }`}>
              <div className="flex items-center gap-1.5 font-medium mb-1.5">
                {r.passed ? <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />}
                <span className="text-foreground">{t('practice.testCase')}{' '}{i + 1}{' '}{t('practice.ofTotalTests', { total_tests: result.total_tests })}</span>
                <span className="text-muted-foreground ml-auto">{r.time_ms}ms</span>
              </div>
              <div className="mt-1.5 font-mono text-[11px] space-y-0.5">
                <p className="text-muted-foreground">{t('practice.input')}{' '}<span className="text-foreground">{r.input || t('practice.empty')}</span></p>
                <p className="text-muted-foreground">{t('practice.expected')}{' '}<span className="text-foreground">{r.expected || t('practice.empty')}</span></p>
                {!r.passed && (
                  <p className="text-muted-foreground">{t('practice.got')}{' '}<span className="text-red-700 dark:text-red-400">{r.stdout || t('practice.empty')}</span></p>
                )}
                {r.passed && (
                  <p className="text-muted-foreground">{t('practice.got')}{' '}<span className="text-green-700 dark:text-green-400">{r.stdout || t('practice.empty')}</span></p>
                )}
                {r.stderr && <pre className="mt-1 text-red-700 dark:text-red-400 bg-red-500/5 rounded p-1.5 overflow-auto max-h-20">{r.stderr}</pre>}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.stderr_excerpt && !result.results.some(r => r.stderr) && (
        <pre className="text-xs text-red-700 dark:text-red-400 bg-red-500/5 rounded-lg p-3 overflow-auto max-h-24 font-mono">{result.stderr_excerpt}</pre>
      )}
    </div>
  )
}