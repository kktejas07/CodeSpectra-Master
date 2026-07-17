'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Play, Send, Loader2, CheckCircle, AlertCircle, Trophy,
} from 'lucide-react'
import { HUNDRED_DAYS } from '@/lib/100-days-data'
import { csrfFetch } from '@/lib/csrf-fetch'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

const MONACO_MAP: Record<string, string> = {
  python: 'python', javascript: 'javascript', java: 'java', cpp: 'cpp',
}

const LANG_OPTIONS = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
]

interface RunResult {
  passed: boolean; input: string; expected: string
  stdout: string; stderr: string | null; time_ms: number
}
interface RunResponse {
  status: string; passed_tests: number; total_tests: number
  total_time_ms: number; stderr_excerpt: string | null; results: RunResult[]
}

export default function DayPage() {
  const params = useParams()
  const day = parseInt(String(params?.day ?? '0'), 10)
  const problem = useMemo(() => HUNDRED_DAYS.find(p => p.day === day), [day])

  const [language, setLanguage] = useState('python')
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [completed, setCompleted] = useState(false)
  const codeRef = useRef(code)
  codeRef.current = code

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
    setShowResults(false)
  }, [problem, language])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('100-days-completed')
      const set = new Set(raw ? JSON.parse(raw) as number[] : [])
      if (set.has(day)) setCompleted(true)
    } catch {}
  }, [day])

  if (!problem || day < 1 || day > 100) {
    return (
      <div className="space-y-4">
        <Card className="p-6 border-border/60">
          <p className="text-muted-foreground">Day {day} is not available yet.</p>
          <Button asChild variant="link" className="h-auto p-0 mt-2">
            <Link href="/dashboard/100-days">Back to overview</Link>
          </Button>
        </Card>
      </div>
    )
  }

  const diffStyle = {
    easy: 'text-green-600 dark:text-green-400',
    medium: 'text-amber-600 dark:text-amber-400',
    hard: 'text-red-600 dark:text-red-400',
  }[problem.difficulty]

  const execute = async () => {
    if (!codeRef.current.trim()) return
    setRunning(true)
    setResult(null)
    setShowResults(true)
    try {
      const res = await csrfFetch('/api/arena/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_code: codeRef.current,
          language,
          test_cases: problem.examples.map(ex => ({ input: ex.input, expected_output: ex.output })),
          mode: 'run',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setResult(json)
    } catch (e: any) {
      setResult({
        status: 'error', passed_tests: 0, total_tests: problem.examples.length,
        total_time_ms: 0, stderr_excerpt: e.message, results: [],
      })
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = async () => {
    if (!codeRef.current.trim()) return
    setSubmitting(true)
    setResult(null)
    setShowResults(true)
    try {
      const res = await csrfFetch('/api/arena/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          source_code: codeRef.current,
          language,
          test_cases: problem.examples.map(ex => ({ input: ex.input, expected_output: ex.output })),
          mode: 'submit',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Submit failed')
      setResult(json)
      if (json.status === 'accepted') {
        setCompleted(true)
        try {
          const raw = localStorage.getItem('100-days-completed')
          const set = new Set(raw ? JSON.parse(raw) as number[] : [])
          set.add(day)
          localStorage.setItem('100-days-completed', JSON.stringify([...set]))
        } catch {}
      }
    } catch (e: any) {
      setResult({
        status: 'error', passed_tests: 0, total_tests: problem.examples.length,
        total_time_ms: 0, stderr_excerpt: e.message, results: [],
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/dashboard/100-days"><ArrowLeft className="h-4 w-4" /> All days</Link>
        </Button>
        <Badge variant="outline" className="font-mono">Day {day}</Badge>
        <h1 className="text-2xl font-bold text-foreground">{problem.title}</h1>
        <Badge className={diffStyle}>{problem.difficulty}</Badge>
        {completed && (
          <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 gap-1">
            <CheckCircle className="h-3 w-3" /> Done
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: problem */}
        <Card className="p-6 border-border/60 space-y-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
          <div>
            <h2 className="font-semibold text-foreground mb-2">Description</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{problem.description}</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-1">Input Format</h3>
            <p className="text-xs text-muted-foreground">{problem.inputFormat}</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-1">Output Format</h3>
            <p className="text-xs text-muted-foreground">{problem.outputFormat}</p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm mb-1">Constraints</h3>
            <pre className="text-xs text-muted-foreground font-mono">{problem.constraints}</pre>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground text-sm">Examples</h3>
            {problem.examples.map((ex, i) => (
              <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs space-y-1">
                <p className="text-foreground/80">Input: <span className="text-foreground">{ex.input || '(empty)'}</span></p>
                <p className="text-foreground/80">Output: <span className="text-foreground">{ex.output || '(empty)'}</span></p>
                {ex.explanation && <p className="text-muted-foreground mt-1">{ex.explanation}</p>}
              </div>
            ))}
          </div>
        </Card>

        {/* Right: editor + results */}
        <div className="flex flex-col space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={language}
              onChange={(e) => { setLanguage(e.target.value); setResult(null); setShowResults(false) }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LANG_OPTIONS.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            <div className="flex gap-2 ml-auto">
              <Button onClick={execute} disabled={running || submitting} variant="outline" size="sm" className="gap-1.5">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run
              </Button>
              <Button onClick={handleSubmit} disabled={running || submitting} size="sm" className="gap-1.5">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </Button>
            </div>
          </div>

          {/* Monaco */}
          <div className="h-[400px] rounded-lg border border-border overflow-hidden">
            <Editor
              height="100%"
              language={MONACO_MAP[language] || 'plaintext'}
              theme={isDark ? 'vs-dark' : 'vs'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                fontSize: 13, minimap: { enabled: false }, automaticLayout: true,
                scrollBeyondLastLine: false, tabSize: 2, wordWrap: 'on',
              }}
            />
          </div>

          {/* Results */}
          {showResults && (
            <Card className="border-border/60">
              {!result ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Running on Piston&hellip;
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    result.status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                    result.status === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {result.status === 'accepted' ? (
                      <><CheckCircle className="h-4 w-4" /> All tests passed{completed ? ' — Day complete!' : ''}</>
                    ) : result.status === 'error' ? (
                      <><AlertCircle className="h-4 w-4" /> Error</>
                    ) : (
                      <><AlertCircle className="h-4 w-4" /> {result.passed_tests}/{result.total_tests} passed</>
                    )}
                    <span className="text-xs text-muted-foreground font-normal ml-auto">{result.total_time_ms}ms</span>
                  </div>

                  {/* Per-test-case */}
                  {result.results.length > 0 && (
                    <div className="space-y-2">
                      {result.results.map((r, i) => (
                        <div key={i} className={`rounded-md border p-3 text-xs ${
                          r.passed ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
                        }`}>
                          <div className="flex items-center gap-1.5 font-medium mb-1">
                            {r.passed ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                            <span className="text-foreground">Test case {i + 1}</span>
                            <span className="text-muted-foreground ml-auto">{r.time_ms}ms</span>
                          </div>
                          {!r.passed && (
                            <div className="mt-1 font-mono text-[11px] space-y-0.5">
                              <p className="text-muted-foreground">Input: <span className="text-foreground">{r.input || '(empty)'}</span></p>
                              <p className="text-muted-foreground">Expected: <span className="text-foreground">{r.expected || '(empty)'}</span></p>
                              <p className="text-muted-foreground">Got: <span className="text-red-400">{r.stdout || '(empty)'}</span></p>
                              {r.stderr && <pre className="mt-1 text-red-400 bg-red-500/5 rounded p-1.5 overflow-auto max-h-20">{r.stderr}</pre>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {result.stderr_excerpt && !result.results.some(r => r.stderr) && (
                    <pre className="text-xs text-red-400 bg-red-500/5 rounded-md p-3 overflow-auto max-h-24 font-mono">
                      {result.stderr_excerpt}
                    </pre>
                  )}

                  {completed && (
                    <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 rounded-md p-3">
                      <Trophy className="h-4 w-4" />
                      Day {day} completed! Keep up the streak.
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
