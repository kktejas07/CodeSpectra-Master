'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Code2, Play, Send, CheckCircle, AlertCircle, Loader2, ArrowRight, Sparkles, Database, Trophy } from 'lucide-react'
import { getArenaChallenge, getNextArenaChallengeId, type ArenaChallenge } from '@/lib/arena-challenges'
import { PROGRAMMING_LANGUAGES } from '@/lib/languages'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

const ARENA_LANG_IDS = ['javascript', 'typescript', 'python', 'java', 'cpp'] as const

const MONACO_LANG_MAP: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
}

interface RunResult {
  passed: boolean
  input: string
  expected: string
  stdout: string
  stderr: string | null
  time_ms: number
}

interface RunResponse {
  status: string
  passed_tests: number
  total_tests: number
  total_time_ms: number
  stderr_excerpt: string | null
  results: RunResult[]
}

function ArenaChallengeInner() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const baseChallenge = useMemo(() => getArenaChallenge(id), [id])
  const nextId = useMemo(() => getNextArenaChallengeId(id), [id])

  const [challenge, setChallenge] = useState<ArenaChallenge | null>(baseChallenge ?? null)
  const [source, setSource] = useState<'ai' | 'static' | null>(null)
  const [adaptNotice, setAdaptNotice] = useState<string | null>(null)

  useEffect(() => {
    setChallenge(baseChallenge ?? null)
    setSource(null)
    setAdaptNotice(null)
  }, [baseChallenge])

  useEffect(() => {
    if (!baseChallenge) return
    const ac = new AbortController()
    void (async () => {
      try {
        let stack: string[] = []
        try {
          const raw = localStorage.getItem('codespectra-tech-stack')
          if (raw) stack = JSON.parse(raw) as string[]
        } catch { stack = [] }
        const res = await csrfFetch('/api/arena/adapt', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: id, userStack: stack }),
          signal: ac.signal,
        })
        const json = await res.json() as { source?: string; challenge?: ArenaChallenge; notice?: string }
        if (json.challenge) {
          setChallenge(json.challenge)
          setSource(json.source === 'ai' ? 'ai' : 'static')
        }
        if (json.notice) setAdaptNotice(json.notice)
      } catch {
        if (!ac.signal.aborted) setChallenge(baseChallenge)
      }
    })()
    return () => ac.abort()
  }, [id, baseChallenge])

  const languageOptions = useMemo(
    () => PROGRAMMING_LANGUAGES.filter((l) => (ARENA_LANG_IDS as readonly string[]).includes(l.id)),
    [],
  )

  const [language, setLanguage] = useState(languageOptions[0]?.id ?? 'javascript')
  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const codeRef = useRef(code)
  codeRef.current = code

  useEffect(() => {
    if (!challenge) return
    setCode(challenge.defaultCode[language] ?? challenge.defaultCode.javascript ?? '')
    setResult(null)
    setShowResults(false)
  }, [challenge, language])

  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const handleRun = useCallback(async () => {
    if (!challenge) return
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
          test_cases: challenge.examples.map(ex => ({
            input: ex.input,
            expected_output: ex.output,
          })),
          mode: 'run',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Run failed')
      setResult(json)
    } catch (e: any) {
      setResult({
        status: 'error',
        passed_tests: 0,
        total_tests: challenge.examples.length,
        total_time_ms: 0,
        stderr_excerpt: e.message,
        results: [],
      })
    } finally {
      setRunning(false)
    }
  }, [challenge, language])

  const handleSubmit = useCallback(async () => {
    if (!challenge) return
    setSubmitted(true)
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
          test_cases: challenge.examples.map(ex => ({
            input: ex.input,
            expected_output: ex.output,
          })),
          mode: 'submit',
        }),
      })
      const json = await res.json() as RunResponse & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Submit failed')
      setResult(json)
      if (json.status === 'accepted' && nextId) {
        setTimeout(() => router.push(`/dashboard/arena/${nextId}`), 1400)
      }
    } catch (e: any) {
      setResult({
        status: 'error',
        passed_tests: 0,
        total_tests: challenge.examples.length,
        total_time_ms: 0,
        stderr_excerpt: e.message,
        results: [],
      })
    } finally {
      setSubmitted(false)
    }
  }, [challenge, language, nextId, router])

  if (!challenge) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>Challenge not found</AlertTitle>
          <AlertDescription>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href="/dashboard/arena">Back to arena</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const diffStyles: Record<string, string> = {
    easy: 'bg-green-500/10 text-green-600 dark:text-green-400',
    medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    hard: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2" data-tour="arena-detail-header">
        <div className="flex flex-wrap items-center gap-2">
          <Code2 className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">{challenge.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={diffStyles[challenge.difficulty] ?? ''}>{challenge.difficulty?.toUpperCase() || 'EASY'}</Badge>
          <Badge variant="secondary">{challenge.category}</Badge>
          <Badge variant="outline">{challenge.points} pts</Badge>
          {source === 'ai' ? (
            <Badge className="gap-1 border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <Sparkles className="h-3 w-3" />
              AI variant
            </Badge>
          ) : source === 'static' ? (
            <Badge variant="outline" className="gap-1 font-normal">
              <Database className="h-3 w-3" />
              Curated seed
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: problem statement */}
        <Card className="space-y-4 border-border/60 p-6 overflow-y-auto max-h-[calc(100vh-14rem)]">
          <h2 className="font-semibold text-foreground">Problem</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {challenge.statement.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Examples</h3>
            {challenge.examples.map((ex, i) => (
              <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-xs">
                <p className="text-foreground/80">Input: {ex.input}</p>
                <p className="text-foreground/80">Output: {ex.output}</p>
                {ex.explanation ? <p className="mt-2 text-muted-foreground">{ex.explanation}</p> : null}
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-foreground">Constraints</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {challenge.constraints.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </Card>

        {/* Right: editor + results */}
        <div className="flex flex-col space-y-4">
          {/* Language + buttons */}
          <div className="flex items-center gap-2 flex-wrap" data-tour="arena-detail-actions">
            <select
              value={language}
              onChange={(e) => { setLanguage(e.target.value); setResult(null); setShowResults(false) }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {languageOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.displayName}</option>
              ))}
            </select>
            <div className="flex gap-2 ml-auto">
              <Button onClick={handleRun} disabled={running || submitted} variant="outline" size="sm" className="gap-1.5">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run
              </Button>
              <Button onClick={handleSubmit} disabled={running || submitted} size="sm" className="gap-1.5">
                {submitted ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </Button>
            </div>
          </div>

          {/* Monaco editor */}
          <div className="h-[400px] rounded-lg border border-border overflow-hidden" data-tour="arena-detail-editor">
            <Editor
              height="100%"
              language={MONACO_LANG_MAP[language] || 'plaintext'}
              theme={isDark ? 'vs-dark' : 'vs'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
          </div>

          {/* Results panel */}
          {showResults && (
            <Card className="border-border/60">
              {!result ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Executing on Piston&hellip;
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {/* Status */}
                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    result.status === 'accepted' ? 'text-green-600 dark:text-green-400' :
                    result.status === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-amber-600 dark:text-amber-400'
                  }`}>
                    {result.status === 'accepted' ? (
                      <><CheckCircle className="h-4 w-4" /> All tests passed</>
                    ) : result.status === 'error' ? (
                      <><AlertCircle className="h-4 w-4" /> Error</>
                    ) : (
                      <><AlertCircle className="h-4 w-4" /> {result.passed_tests}/{result.total_tests} passed</>
                    )}
                    <span className="text-xs text-muted-foreground font-normal ml-auto">
                      {result.total_time_ms}ms
                    </span>
                  </div>

                  {/* Test case details */}
                  {result.results.length > 0 && (
                    <div className="space-y-2">
                      {result.results.map((r, i) => (
                        <div key={i} className={`rounded-md border p-3 text-xs ${
                          r.passed ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
                        }`}>
                          <div className="flex items-center gap-1.5 font-medium mb-1">
                            {r.passed
                              ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              : <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                            }
                            <span className="text-foreground">Test case {i + 1}</span>
                            <span className="text-muted-foreground ml-auto">{r.time_ms}ms</span>
                          </div>
                          {!r.passed && (
                            <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                              <p className="text-muted-foreground">
                                Input: <span className="text-foreground">{r.input || '(empty)'}</span>
                              </p>
                              <p className="text-muted-foreground">
                                Expected: <span className="text-foreground">{r.expected || '(empty)'}</span>
                              </p>
                              <p className="text-muted-foreground">
                                Got: <span className="text-red-400">{r.stdout || '(empty)'}</span>
                              </p>
                              {r.stderr && (
                                <pre className="mt-1 text-red-400 bg-red-500/5 rounded p-1.5 overflow-auto max-h-20">
                                  {r.stderr}
                                </pre>
                              )}
                            </div>
                          )}
                          {r.passed && r.stdout && (
                            <p className="text-muted-foreground font-mono">
                              Output: {r.stdout.slice(0, 120)}{r.stdout.length > 120 ? '...' : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stderr excerpt for compile/runtime errors */}
                  {result.stderr_excerpt && !result.results.some(r => r.stderr) && (
                    <pre className="text-xs text-red-400 bg-red-500/5 rounded-md p-3 overflow-auto max-h-24 font-mono">
                      {result.stderr_excerpt}
                    </pre>
                  )}

                  {/* Auto-nav notice */}
                  {result.status === 'accepted' && nextId && (
                    <p className="text-xs text-muted-foreground text-center">
                      <Trophy className="h-3 w-3 inline mr-1" />
                      Next challenge opening momentarily&hellip;
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}

          {nextId && (
            <Button asChild variant="ghost" className="w-full gap-2 text-muted-foreground">
              <Link href={`/dashboard/arena/${nextId}`}>
                Skip to next <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ArenaChallengePage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const arenaDetailTour: TourStep[] = [
        {
          target: '[data-tour="arena-detail-header"]',
          title: 'Solve Rated Coding Challenges',
          description: 'This page gives every user one arena challenge with its difficulty and points.',
          position: 'bottom',
        },
        {
          target: '[data-tour="arena-detail-actions"]',
          title: 'Run Then Submit Solution',
          description: 'Test with Run, then Submit to advance to the next challenge.',
          position: 'bottom',
        },
        {
          target: '[data-tour="arena-detail-editor"]',
          title: 'Tip: Match Sample Outputs',
          description: 'Tip: type your solution here in the selected language and mirror the example inputs and outputs.',
          position: 'top',
        },
      ]
      autoPlayPageTour('arena-detail', arenaDetailTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="min-h-[30vh]">
      <ArenaChallengeInner />
    </div>
  )
}
