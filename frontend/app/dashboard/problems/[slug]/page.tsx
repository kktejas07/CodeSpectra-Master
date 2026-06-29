'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Code2,
  Loader2,
  Play,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SmartHintsPanel } from '@/components/ai/smart-hints-panel'
import { ProctorMonitor } from '@/components/ai/proctor-monitor'
import { AnalysisPanel } from '@/components/ai/analysis-panel'

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

const SUPPORTED_LANGS = [
  { id: 'python', label: 'Python 3' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'csharp', label: 'C#' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
] as const

const MONACO_LANG: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  cpp: 'cpp',
  java: 'java',
  go: 'go',
  rust: 'rust',
  csharp: 'csharp',
  ruby: 'ruby',
  php: 'php',
}

export default function ProblemDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [language, setLanguage] = useState<string>('python')
  const [source, setSource] = useState<string>('')
  const [tab, setTab] = useState<'samples' | 'results' | 'console' | 'analysis'>('samples')
  const [running, setRunning] = useState<'run' | 'submit' | null>(null)
  const [result, setResult] = useState<RunResponse | null>(null)
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const sourceRef = useRef(source)
  sourceRef.current = source

  useEffect(() => {
    if (!slug) return // wait for params to resolve
    void (async () => {
      try {
        const res = await fetch(`/api/problems/${slug}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load problem')
        const p = json as Problem
        setProblem(p)
        const initialLang =
          SUPPORTED_LANGS.find((l) => p.starter_code?.[l.id])?.id || 'python'
        setLanguage(initialLang)
        setSource(p.starter_code?.[initialLang] ?? '// Write your solution here\n')
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [slug])

  function onChangeLanguage(next: string) {
    setLanguage(next)
    const newCode = problem?.starter_code?.[next]
    if (newCode) {
      setSource(newCode)
    } else {
      setSource(`// ${SUPPORTED_LANGS.find(l => l.id === next)?.label || next} solution\n\n`)
    }
    setResult(null)
    setAnalysis(null)
  }

  async function execute(mode: 'run' | 'submit') {
    if (!problem) return
    setRunning(mode)
    setResult(null)
    setTab(mode === 'run' ? 'results' : 'results')
    try {
      const res = await fetch('/api/submissions', {
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
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setResult(json)
      // Auto-run AI Code Analysis on submit
      if (mode === 'submit') {
        setAnalysisLoading(true)
        fetch('/api/ai/code-analysis', {
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
        mode,
        status: 'error',
        score: 0,
        passed_tests: 0,
        total_tests: 0,
        stderr_excerpt: e instanceof Error ? e.message : String(e),
        results: [],
        submissionId: null,
      })
    } finally {
      setRunning(null)
    }
  }

  const difficultyTone = useMemo(() => {
    if (!problem) return ''
    return problem.difficulty === 'easy'
      ? 'text-primary border-primary/30 bg-primary/10'
      : problem.difficulty === 'medium'
        ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
        : 'text-destructive border-destructive/40 bg-destructive/10'
  }, [problem])

  if (loadError) {
    return (
      <div className="flex items-center justify-center p-6 py-20">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 max-w-md">
          <h2 className="font-semibold text-destructive mb-1">Could not load problem</h2>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Link
            href="/dashboard/problems"
            className="inline-flex items-center gap-1 text-primary mt-3 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back to problems
          </Link>
        </div>
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* AI Proctoring — silent monitor pinned top-right */}
      <ProctorMonitor sessionKind="problem" sessionId={problem.slug} />

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/problems"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm"
            data-testid="back-to-problems"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">All problems</span>
          </Link>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <h1 className="font-semibold truncate" data-testid="problem-title">
            {problem.title}
          </h1>
          <span
            className={`text-xs px-2 py-0.5 rounded border capitalize hidden sm:inline ${difficultyTone}`}
          >
            {problem.difficulty}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm"
          >
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">CodeSpectra</span>
          </Link>
        </div>
      </header>

      {/* 2-pane split */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* LEFT — Problem statement */}
        <section className="lg:w-[42%] xl:w-[40%] border-b lg:border-b-0 lg:border-r border-border overflow-y-auto p-6 lg:p-8 space-y-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {problem.topics.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
            <h2 className="text-2xl font-bold mb-2">{problem.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded border capitalize ${difficultyTone}`}>
              {problem.difficulty}
            </span>
          </div>

          <Markdownish text={problem.statement_md} />

          {problem.input_format && (
            <Section title="Input Format">
              <pre className="text-sm bg-muted/40 rounded p-3 whitespace-pre-wrap font-mono">
                {problem.input_format}
              </pre>
            </Section>
          )}

          {problem.output_format && (
            <Section title="Output Format">
              <pre className="text-sm bg-muted/40 rounded p-3 whitespace-pre-wrap font-mono">
                {problem.output_format}
              </pre>
            </Section>
          )}

          {problem.constraints && (
            <Section title="Constraints">
              <pre className="text-sm bg-muted/40 rounded p-3 whitespace-pre-wrap font-mono">
                {problem.constraints}
              </pre>
            </Section>
          )}

          {problem.test_cases.length > 0 && (
            <Section title="Sample Cases">
              <div className="space-y-3">
                {problem.test_cases.map((t, i) => (
                  <div key={t.id} className="rounded border border-border bg-card/40">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                      Sample #{i + 1}
                    </div>
                    <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                      <div className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">Input</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap">{t.stdin}</pre>
                      </div>
                      <div className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">Expected Output</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {t.expected_stdout}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {problem.hidden_test_count > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  + {problem.hidden_test_count} hidden test case(s) run on Submit.
                </p>
              )}
            </Section>
          )}

          {problem.example_explanation && (
            <Section title="Explanation">
              <p className="text-sm text-muted-foreground">{problem.example_explanation}</p>
            </Section>
          )}

          {/* AI Smart Hints */}
          <SmartHintsPanel
            problemSlug={problem.slug}
            language={language}
            currentCode={source}
          />
        </section>

        {/* RIGHT — Editor + console */}
        <section className="flex-1 flex flex-col min-w-0">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/30 shrink-0">
            <select
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value)}
              className="bg-background border border-border rounded px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="language-select"
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => execute('run')}
                disabled={running !== null}
                data-testid="run-button"
              >
                {running === 'run' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Play className="h-4 w-4 mr-1.5" />
                )}
                Run
              </Button>
              <Button
                size="sm"
                onClick={() => execute('submit')}
                disabled={running !== null}
                data-testid="submit-button"
              >
                {running === 'submit' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                Submit
              </Button>
            </div>
          </div>

          {/* Monaco editor */}
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={MONACO_LANG[language] || 'plaintext'}
              theme="vs-dark"
              value={source}
              onChange={(v) => setSource(v ?? '')}
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

          {/* Bottom panel */}
          <div className="border-t border-border bg-card/20 shrink-0 h-[260px] flex flex-col">
            <div className="flex items-center gap-1 px-3 pt-2 text-sm">
              <TabBtn current={tab} value="samples" onClick={setTab}>
                Sample Tests
              </TabBtn>
              <TabBtn current={tab} value="results" onClick={setTab}>
                {result ? <ResultPill r={result} /> : 'Results'}
              </TabBtn>
              <TabBtn current={tab} value="console" onClick={setTab}>
                Console
              </TabBtn>
              <TabBtn current={tab} value="analysis" onClick={setTab}>
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> AI Analysis
                </span>
              </TabBtn>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {tab === 'samples' && (
                <SampleTests cases={problem.test_cases} />
              )}
              {tab === 'results' && <ResultsPanel result={result} running={running !== null} />}
              {tab === 'console' && (
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                  {result?.stderr_excerpt ||
                    '// stdout/stderr from your last run will appear here'}
                </pre>
              )}
              {tab === 'analysis' && (
                <AnalysisPanel analysis={analysis} loading={analysisLoading} hasSubmitted={!!result && result.mode === 'submit'} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Markdownish({ text }: { text: string }) {
  // Lightweight inline rendering — keeps line breaks + **bold** + `code`.
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-foreground">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p class="mt-3 leading-relaxed">')
  return (
    <div
      className="prose prose-invert max-w-none text-sm leading-relaxed text-foreground/85"
      dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
    />
  )
}

function TabBtn({
  current,
  value,
  onClick,
  children,
}: {
  current: string
  value: 'samples' | 'results' | 'console' | 'analysis'
  onClick: (v: 'samples' | 'results' | 'console' | 'analysis') => void
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1.5 rounded-t border-b-2 transition ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
      data-testid={`tab-${value}`}
    >
      {children}
    </button>
  )
}

function ResultPill({ r }: { r: RunResponse }) {
  const ok = r.status === 'accepted'
  return (
    <span className="inline-flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      )}
      Results · {r.passed_tests}/{r.total_tests}
    </span>
  )
}

function SampleTests({
  cases,
}: {
  cases: Array<{ id: string; stdin: string; expected_stdout: string }>
}) {
  return (
    <div className="space-y-3">
      {cases.map((t, i) => (
        <div key={t.id} className="rounded border border-border bg-card/40 p-3 text-xs">
          <div className="text-muted-foreground mb-1">Sample #{i + 1}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground mb-0.5">stdin</div>
              <pre className="font-mono whitespace-pre-wrap">{t.stdin}</pre>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">expected</div>
              <pre className="font-mono whitespace-pre-wrap">{t.expected_stdout}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultsPanel({
  result,
  running,
}: {
  result: RunResponse | null
  running: boolean
}) {
  if (running) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Executing on Piston…
      </div>
    )
  }
  if (!result) {
    return (
      <p className="text-sm text-muted-foreground">
        Click <strong>Run</strong> to test on sample cases, or <strong>Submit</strong> to grade against all (incl. hidden) tests.
      </p>
    )
  }
  const ok = result.status === 'accepted'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${
            ok
              ? 'border-primary/40 text-primary bg-primary/10'
              : 'border-destructive/40 text-destructive bg-destructive/10'
          }`}
          data-testid="result-status"
        >
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {result.status.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-muted-foreground">
          Passed {result.passed_tests}/{result.total_tests}{' '}
          {result.total_time_ms != null && `· ${result.total_time_ms}ms`}
        </span>
        {result.score != null && (
          <span className="text-xs ml-auto text-muted-foreground">
            Score: <span className="text-foreground font-semibold">{result.score}</span>%
          </span>
        )}
      </div>

      {result.results.length > 0 && (
        <div className="space-y-2">
          {result.results.map((r, i) => (
            <div
              key={r.test_id}
              className={`rounded border p-2.5 text-xs ${
                r.passed
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-destructive/30 bg-destructive/5'
              }`}
              data-testid={`test-row-${i}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {r.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  Test #{i + 1} {r.is_sample ? '· sample' : '· hidden'}
                </span>
                <span className="text-muted-foreground">{r.time_ms ?? '—'}ms</span>
              </div>
              {!r.passed && r.is_sample && (
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground">your output</div>
                    <pre className="font-mono whitespace-pre-wrap mt-0.5">{r.stdout ?? '—'}</pre>
                  </div>
                  <div>
                    <div className="text-muted-foreground">expected</div>
                    <pre className="font-mono whitespace-pre-wrap mt-0.5">{r.expected ?? '—'}</pre>
                  </div>
                </div>
              )}
              {!r.passed && r.stderr && (
                <pre className="mt-2 font-mono whitespace-pre-wrap text-destructive">
                  {r.stderr}
                </pre>
              )}
              {r.error && (
                <pre className="mt-2 font-mono whitespace-pre-wrap text-destructive">{r.error}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      {result.stderr_excerpt && result.results.length === 0 && (
        <pre className="text-xs font-mono text-destructive whitespace-pre-wrap">
          {result.stderr_excerpt}
        </pre>
      )}
    </div>
  )
}
