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
}

const LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
  node: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  csharp: 'csharp',
  php: 'php',
  ruby: 'ruby',
  swift: 'swift',
  kotlin: 'kotlin',
  bash: 'bash',
  sh: 'bash',
}

const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  csharp: 'C#',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
  kotlin: 'Kotlin',
  bash: 'Bash',
}

export function CodingQuestionEditor({
  question,
  answer,
  onChange,
  language,
}: CodingQuestionEditorProps) {
  const [showTestCases, setShowTestCases] = useState(true)
  const [mounted, setMounted] = useState(false)

  const sampleTestCases = question.test_cases?.filter(tc => tc.isSample !== false) || []
  const hasTestCases = sampleTestCases.length > 0

  useEffect(() => {
    setMounted(true)
  }, [])

  const editorOptions = useMemo(() => ({
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: 'on',
    theme: 'vs-dark',
    language: LANGUAGE_MAP[language.toLowerCase()] || 'python',
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
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-300 capitalize">
              {LANGUAGE_LABELS[language.toLowerCase()] || language}
            </span>
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
          </div>
        </div>
        <div
          style={{ height: '400px', minHeight: '400px' }}
          className="relative"
        >
          <Editor
            height="100%"
            value={initialCode}
            onChange={onChange}
            options={editorOptions}
          />
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
