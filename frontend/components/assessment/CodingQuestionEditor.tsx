'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Terminal, ChevronDown, ChevronUp, Copy, Play, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface TestCase {
  input: string
  output: string
  explanation?: string
  isSample?: boolean
}

interface CodingQuestionEditorProps {
  question: {
    starter_code?: string;
    language?: string;
    test_cases?: TestCase[];
  }
  answer: string
  onChange: (code: string | undefined) => void
  language: string
  /** Called when the candidate switches language. Value is a Piston runtime id. */
  onLanguageChange?: (language: string) => void
  /**
   * When the question is authored for a fixed language (it ships a
   * `starter_code`/`language`, e.g. debug/completion/review tasks), lock the
   * picker so the candidate can't switch and end up with a mismatched snippet.
   */
  lockLanguage?: boolean
}

/** Languages + ids live in lib/code-languages.ts (shared with the take page + grader). */
import { CODE_LANGUAGES, monacoIdFor } from '@/lib/code-languages'
import { useT } from '@/lib/i18n/client'

/** Seconds to wait for the Monaco CDN before falling back to a plain editor. */
const MONACO_LOAD_TIMEOUT_MS = 7000

export function CodingQuestionEditor({
  question,
  answer,
  onChange,
  language,
  onLanguageChange,
  lockLanguage = false,
}: CodingQuestionEditorProps) {
  const { t } = useT()
  const [showTestCases, setShowTestCases] = useState(true)
  const [mounted, setMounted] = useState(false)
  // Monaco loads its runtime from a CDN. On a blocked/slow campus network or a
  // touch device it can fail to initialize with no error — the candidate then
  // sees a dead box and cannot type. `plain` guarantees a working textarea.
  const [editorMode, setEditorMode] = useState<'monaco' | 'plain'>('monaco')
  const monacoReadyRef = useRef(false)

  const sampleTestCases = question.test_cases?.filter(tc => tc.isSample !== false) || []
  const hasTestCases = sampleTestCases.length > 0

  // Run the visible sample cases only (hidden cases are graded server-side
  // after submit). Rate-limited by /api/execute-code.
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runResults, setRunResults] = useState<Array<{ passed: boolean; output: string; stderr: string }> | null>(null)
  const runSamples = async () => {
    const source = answer || question.starter_code || ''
    if (!source.trim() || running) return
    setRunning(true)
    setRunError(null)
    try {
      const res = await csrfFetch('/api/execute-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language, source, test_cases: sampleTestCases.map((tc) => ({ input: tc.input, output: tc.output })) }),
      })
      const j = await res.json().catch(() => ({})) as { error?: string; results?: Array<{ passed: boolean; output: string; stderr: string }> }
      if (!res.ok || !Array.isArray(j.results)) throw new Error(j.error || (res.status === 429 ? t('exam.tooManyRunsWaitAMoment3aa') : t('exam.couldntRunYourCode')))
      setRunResults(j.results)
      setShowTestCases(true)
    } catch (e) {
      setRunResults(null)
      setRunError(e instanceof Error ? e.message : t('exam.couldntRunYourCode'))
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-fallback if Monaco hasn't mounted in time.
  useEffect(() => {
    if (editorMode !== 'monaco') return
    const timer = setTimeout(() => {
      if (!monacoReadyRef.current) setEditorMode('plain')
    }, MONACO_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [editorMode])

  const editorOptions = useMemo(() => ({
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: 'on',
    theme: 'vs-dark',
    language: monacoIdFor(language),
  }), [language])

  const initialCode = answer || question.starter_code || ''

  const copyCode = async () => {
    await navigator.clipboard.writeText(initialCode)
  }

  if (!mounted) {
    return (
      <div className="border border-border rounded-2xl overflow-hidden bg-zinc-950 h-[400px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="border border-border rounded-2xl overflow-hidden bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-400" />
            {/* Language — the question's authored runtime id (used for grading). */}
            {lockLanguage ? (
              <span
                title={t('exam.thisQuestionIsWrittenInAa2b')}
                className="h-7 inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-2 text-xs font-medium text-zinc-200"
              >
                {CODE_LANGUAGES.find((l) => l.id === language.toLowerCase())?.label || language}
              </span>
            ) : (
              <select
                aria-label={t('exam.programmingLanguage')}
                value={language.toLowerCase()}
                onChange={(e) => onLanguageChange?.(e.target.value)}
                className="h-7 rounded border border-zinc-700 bg-zinc-800 px-2 text-xs font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CODE_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            )}
            {question.starter_code && (
              <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">{t('exam.starterCodeProvided')}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {hasTestCases && (
              <Button
                variant="ghost"
                size="sm"
                onClick={runSamples}
                disabled={running || !(answer || question.starter_code || '').trim()}
                title={t('exam.runYourCodeAgainstTheSample0b4')}
                className="h-8 px-2 text-xs gap-1 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span className="text-[10px]">{t('exam.runSamples')}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyCode}
              title={t('exam.copyCode')}
              className="h-8 px-2 text-xs gap-1 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="text-[10px]">{t('exam.copy')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditorMode((m) => (m === 'monaco' ? 'plain' : 'monaco'))}
              title={t('exam.switchBetweenTheRichEditorAnd1fd')}
              className="h-8 px-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <span className="text-[10px]">{editorMode === 'monaco' ? t('exam.plainEditor') : t('exam.richEditor')}</span>
            </Button>
          </div>
        </div>
        <div
          style={{ height: '400px', minHeight: '400px' }}
          className="relative"
        >
          {editorMode === 'plain' ? (
            <textarea
              value={initialCode}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label={t('exam.codeEditor')}
              placeholder={t('exam.typeYourCodeHere')}
              className="w-full h-full resize-none bg-zinc-950 text-zinc-100 font-mono text-[13px] leading-relaxed p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          ) : (
            <Editor
              height="100%"
              value={initialCode}
              onChange={onChange}
              options={editorOptions}
              onMount={() => { monacoReadyRef.current = true }}
              loading={
                <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-xs text-zinc-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}{t('exam.loadingEditor')}</div>
              }
            />
          )}
        </div>
      </div>

      {runError && (
        <p role="alert" className="text-xs text-destructive">{runError}</p>
      )}

      {/* Sample test cases (Run samples fills in pass/fail; hidden cases are graded after submit) */}
      {hasTestCases && (
        <div className="border border-border rounded-2xl overflow-hidden bg-card">
          <button
            onClick={() => setShowTestCases(!showTestCases)}
            className="w-full px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between text-sm font-medium text-foreground hover:bg-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5" />{t('exam.sampleTestCases')}<span className="tabular-nums">{sampleTestCases.length}</span>)
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {showTestCases ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />{t('exam.hide')}</>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />{t('exam.show')}</>
              )}
            </span>
          </button>

          {showTestCases && (
            <div className="p-3 space-y-3 max-h-72 overflow-y-auto">
              {sampleTestCases.map((tc, i) => (
                <div
                  key={i}
                  className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/20"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground">{t('exam.testCase')}{' '}{i + 1}</span>
                    {runResults?.[i] && (
                      <span className={cn('inline-flex items-center gap-1 font-medium', runResults[i].passed ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                        {runResults[i].passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {runResults[i].passed ? t('exam.passed') : t('exam.failed')}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">{t('exam.input')}</span>
                      <pre className="font-mono text-foreground whitespace-pre-wrap break-all bg-background border border-border/60 p-2 rounded-lg max-h-24 overflow-auto">
                        {tc.input}
                      </pre>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">{t('exam.expectedOutput')}</span>
                      <pre className="font-mono text-foreground whitespace-pre-wrap break-all bg-background border border-border/60 p-2 rounded-lg max-h-24 overflow-auto">
                        {tc.output}
                      </pre>
                    </div>
                  </div>
                  {runResults?.[i] && !runResults[i].passed && (
                    <div className="text-[11px]">
                      <span className="text-muted-foreground block mb-0.5">{t('exam.yourOutput')}</span>
                      <pre className="font-mono text-foreground whitespace-pre-wrap break-all bg-background border border-border/60 p-2 rounded-lg max-h-24 overflow-auto">
                        {runResults[i].stderr || runResults[i].output || '(no output)'}
                      </pre>
                    </div>
                  )}
                  {tc.explanation && (
                    <p className="text-[11px] text-muted-foreground italic">{tc.explanation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
