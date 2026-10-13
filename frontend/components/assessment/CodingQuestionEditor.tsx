'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Terminal, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  const [showTestCases, setShowTestCases] = useState(true)
  const [mounted, setMounted] = useState(false)
  // Monaco loads its runtime from a CDN. On a blocked/slow campus network or a
  // touch device it can fail to initialize with no error — the candidate then
  // sees a dead box and cannot type. `plain` guarantees a working textarea.
  const [editorMode, setEditorMode] = useState<'monaco' | 'plain'>('monaco')
  const monacoReadyRef = useRef(false)

  const sampleTestCases = question.test_cases?.filter(tc => tc.isSample !== false) || []
  const hasTestCases = sampleTestCases.length > 0

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
      <div className="border border-border rounded-lg overflow-hidden bg-zinc-950 h-[400px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <div className="border border-border rounded-lg overflow-hidden bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-400" />
            {/* Language — the question's authored runtime id (used for grading). */}
            {lockLanguage ? (
              <span
                title="This question is written in a fixed language"
                className="h-7 inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-2 text-xs font-medium text-zinc-200"
              >
                {CODE_LANGUAGES.find((l) => l.id === language.toLowerCase())?.label || language}
              </span>
            ) : (
              <select
                aria-label="Programming language"
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
              <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                Starter code provided
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyCode}
              title="Copy Code"
              className="h-8 px-2 text-xs gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="text-[10px]">Copy</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditorMode((m) => (m === 'monaco' ? 'plain' : 'monaco'))}
              title="Switch between the rich editor and a plain text box"
              className="h-8 px-2 text-xs"
            >
              <span className="text-[10px]">{editorMode === 'monaco' ? 'Plain editor' : 'Rich editor'}</span>
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
              aria-label="Code editor"
              placeholder="Type your code here…"
              className="w-full h-full resize-none bg-zinc-950 text-zinc-100 font-mono text-[13px] leading-relaxed p-3 outline-none"
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading editor…
                </div>
              }
            />
          )}
        </div>
      </div>

      {/* Sample Test Cases Panel (reference only — no live execution) */}
      {hasTestCases && (
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowTestCases(!showTestCases)}
            className="w-full px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between text-sm font-medium hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5" />
              Sample Test Cases ({sampleTestCases.length})
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {showTestCases ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Show
                </>
              )}
            </span>
          </button>

          {showTestCases && (
            <div className="p-3 space-y-3 max-h-72 overflow-y-auto bg-zinc-950/30">
              {sampleTestCases.map((tc, i) => (
                <div
                  key={i}
                  className="space-y-1.5 p-2 rounded border border-zinc-800 bg-zinc-950/50"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 font-mono">Test Case {i + 1}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Input:</span>
                      <pre className="font-mono text-zinc-300 whitespace-pre-wrap break-all bg-zinc-900 p-2 rounded max-h-24 overflow-auto">
                        {tc.input}
                      </pre>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Expected Output:</span>
                      <pre className="font-mono text-zinc-300 whitespace-pre-wrap break-all bg-zinc-900 p-2 rounded max-h-24 overflow-auto">
                        {tc.output}
                      </pre>
                    </div>
                  </div>
                  {tc.explanation && (
                    <p className="text-[10px] text-zinc-500 italic">{tc.explanation}</p>
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
