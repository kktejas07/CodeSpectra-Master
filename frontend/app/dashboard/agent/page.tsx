'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowUp, Bot, CheckCircle2, Code2, Cpu, FileText, Loader2, Play, Sparkles, Terminal, Wand2, HelpCircle, Settings2, Copy, Check, RotateCcw, GitCompare, SquareTerminal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { ModelSelector } from '@/components/ai/model-selector'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })
const DiffEditor = dynamic(() => import('@monaco-editor/react').then(m => m.DiffEditor), { ssr: false })

const STEP_OPTIONS = [1, 2, 3, 4, 5]

interface AgentStep {
  step: number
  thought: string
  summary: string
}

interface AgentRunResult {
  final_code: string
  steps: AgentStep[]
  summary: string
}

interface AgentTurn {
  id: string
  role: 'user' | 'agent'
  content: string
  steps?: AgentStep[]
}

const LANGS = ['python', 'javascript', 'typescript', 'cpp', 'java', 'go'] as const

const STARTER_CODE = `# Type your code or paste a snippet, then ask the agent to refactor, fix bugs, or add tests.
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
`

const SUGGESTED_PROMPTS = [
  'Refactor for O(n) memoization',
  'Add input validation & docstrings',
  'Translate to TypeScript',
  'Generate 3 unit test cases',
]

/**
 * Agent Workspace — Emergent-style two-pane layout:
 *   LEFT  : chat with the agentic AI (multi-step planner)
 *   RIGHT : live Monaco editor showing the code as the agent edits it + Diff + Runner
 */
export default function AgentPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  const [language, setLanguage] = useState<string>('python')
  const [code, setCode] = useState<string>(STARTER_CODE)
  const [originalCode, setOriginalCode] = useState<string>(STARTER_CODE)
  const [diffView, setDiffView] = useState(false)
  const [input, setInput] = useState<string>('')
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [maxSteps, setMaxSteps] = useState(3)
  const [activeTab, setActiveTab] = useState<'code' | 'log'>('code')
  const [copied, setCopied] = useState(false)
  const [runningCode, setRunningCode] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<{ stdout?: string; stderr?: string; error?: string } | null>(null)

  const { lockedFeatures } = useLockedFeatures()
  const logLocked = lockedFeatures.includes('agent:log')
  const logRef = useRef<HTMLDivElement>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReset = () => {
    setCode(STARTER_CODE)
    setOriginalCode(STARTER_CODE)
    setDiffView(false)
    setConsoleOutput(null)
    setShowConsole(false)
  }

  const handleRunCode = async () => {
    if (runningCode || !code.trim()) return
    setRunningCode(true)
    setShowConsole(true)
    setConsoleOutput(null)
    try {
      const res = await csrfFetch('/api/execute-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, source: code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Execution failed')
      setConsoleOutput({
        stdout: data.result?.run?.stdout || (data.passed ? 'Code executed successfully (no stdout).' : ''),
        stderr: data.result?.run?.stderr || '',
      })
    } catch (e: any) {
      setConsoleOutput({ error: e.message || 'Execution failed' })
    } finally {
      setRunningCode(false)
    }
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [turns])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const agentTour: TourStep[] = [
        {
          target: '[data-tour="agent-header"]',
          title: 'Agent workspace overview',
          description: 'This workspace lets developers run an autonomous coding agent to plan and rewrite code.',
          position: 'bottom',
        },
        {
          target: '[data-tour="agent-composer"]',
          title: 'Describe your goal',
          description: 'Type a refactoring or testing goal here and run the agent.',
          position: 'top',
        },
        {
          target: '[data-tour="agent-workspace"]',
          title: 'Review live code',
          description: 'Watch the editor update, toggle diffs, and run the result in the sandbox.',
          position: 'left',
        },
      ]
      autoPlayPageTour('agent', agentTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  async function runAgent(customPrompt?: string) {
    const goal = (customPrompt || input).trim()
    if (!goal || busy) return
    setInput('')
    setOriginalCode(code)
    const userTurn: AgentTurn = { id: `u-${Date.now()}`, role: 'user', content: goal }
    setTurns((t) => [...t, userTurn])
    setBusy(true)
    try {
      const res = await csrfFetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, code, language, max_steps: maxSteps }),
      })
      const j = (await res.json()) as AgentRunResult & { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setCode(j.final_code || code)
      const agentTurn: AgentTurn = {
        id: `a-${Date.now()}`,
        role: 'agent',
        content: j.summary || '(done)',
        steps: j.steps,
      }
      setTurns((t) => [...t, agentTurn])
      setActiveTab('log')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTurns((t) => [
        ...t,
        { id: `e-${Date.now()}`, role: 'agent', content: `Error: ${msg}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card px-5 py-4" data-tour="agent-header">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">AI agent workspace</h1>
            <p className="text-sm text-muted-foreground">Give the agent a goal — it plans the steps and rewrites the code in the editor.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Language"
            className="h-9 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
            data-testid="agent-lang"
          >
            {LANGS.map((l) => (
              <option key={l} value={l} className="bg-popover text-popover-foreground">{l.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            aria-label="Maximum steps"
            className="h-9 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
            data-testid="agent-steps"
          >
            {STEP_OPTIONS.map((s) => (
              <option key={s} value={s} className="bg-popover text-popover-foreground">{s} {s === 1 ? 'step' : 'steps'}</option>
            ))}
          </select>
          <ModelSelector feature="chat_model" />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* LEFT — chat & prompts */}
        <section className="w-full lg:w-[44%] xl:w-[40%] flex flex-col border-r border-border/70 bg-muted/20">
          <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {turns.length === 0 && (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                  What would you like the agent to do?
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Describe a goal or pick a suggestion below. The agent reads your code, plans the steps and rewrites it in the editor on the right.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      onClick={() => void runAgent(p)}
                      className="rounded-full border border-border/70 bg-muted/60 px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t) => (
              <AgentBubble key={t.id} turn={t} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                Working through up to {maxSteps} steps…
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            data-tour="agent-composer"
            onSubmit={(e) => {
              e.preventDefault()
              void runAgent()
            }}
            className="border-t border-border/70 bg-card p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 transition-[border-color,box-shadow] duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void runAgent()
                  }
                }}
                rows={2}
                placeholder="Describe your goal — e.g. 'Refactor to O(n) iterative and add comprehensive test suite'"
                aria-label="Goal for the agent"
                className="flex-1 resize-none bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
                data-testid="agent-input"
                disabled={busy}
              />
              <Button
                type="submit"
                size="icon"
                disabled={busy || !input.trim()}
                aria-label="Run agent"
                className="h-9 w-9 rounded-xl bg-primary text-primary-foreground shadow-sm"
                data-testid="agent-run"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 px-1">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">⌘ + Enter</kbd> to run</span>
              <span className="flex items-center gap-1 font-medium tabular-nums text-muted-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" aria-hidden /> Up to {maxSteps} {maxSteps === 1 ? 'step' : 'steps'}
              </span>
            </div>
          </form>
        </section>

        {/* RIGHT — workspace */}
        <section className="flex-1 flex flex-col min-w-0" data-tour="agent-workspace">
          <div className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-card px-3">
            <TabButton
              active={activeTab === 'code'}
              onClick={() => setActiveTab('code')}
              icon={<Code2 className="h-3.5 w-3.5" />}
              label="Code"
              testid="tab-code"
            />
            {!logLocked && (
            <TabButton
              active={activeTab === 'log'}
              onClick={() => setActiveTab('log')}
              icon={<Terminal className="h-3.5 w-3.5" />}
              label="Steps"
              testid="tab-log"
            />
            )}
            <div className="ml-auto flex items-center gap-2 py-1">
              <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline-flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/50">
                <FileText className="h-3 w-3" />
                workspace.{language}
              </span>
              <button
                type="button"
                onClick={() => setDiffView(!diffView)}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors',
                  diffView
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 border-border/50'
                )}
                title="Compare with the original code"
                aria-pressed={diffView}
                aria-label="Toggle diff view"
              >
                <GitCompare className="h-3 w-3" />
                <span className="hidden md:inline">Diff</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 rounded-lg border border-border/50 transition-colors"
                title="Copy code"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                    <span className="text-green-700 dark:text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/70 rounded-lg border border-border/50 transition-colors"
                title="Reset starter template"
                aria-label="Reset starter template"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <Button
                type="button"
                size="sm"
                onClick={handleRunCode}
                disabled={runningCode}
                className="h-8 gap-1.5 px-3 text-xs font-semibold"
                title="Run code in sandbox"
              >
                {runningCode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                <span>Run</span>
              </Button>
            </div>
          </div>

          {activeTab === 'code' || logLocked ? (
            <div className="flex-1 min-h-0 flex flex-col relative">
              <div className="flex-1 min-h-0">
                {diffView ? (
                  <DiffEditor
                    height="100%"
                    language={language}
                    original={originalCode}
                    modified={code}
                    theme="vs-dark"
                    options={{
                      fontSize: 13,
                      minimap: { enabled: false },
                      automaticLayout: true,
                      readOnly: true,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={code}
                    onChange={(v) => setCode(v ?? '')}
                    options={{
                      fontSize: 13,
                      minimap: { enabled: false },
                      automaticLayout: true,
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  />
                )}
              </div>

              {/* Console Output Drawer */}
              {showConsole && (
                <div className="z-10 flex h-44 flex-col border-t border-slate-800 bg-slate-950 font-mono text-xs text-slate-300">
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
                    <div className="flex items-center gap-2 font-sans text-[11px] font-semibold text-slate-400">
                      <SquareTerminal className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                      <span>Console</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowConsole(false)}
                      className="rounded p-0.5 text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400"
                      title="Close console"
                      aria-label="Close console"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-1">
                    {runningCode && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400 motion-reduce:animate-none" />
                        <span>Running in the sandbox…</span>
                      </div>
                    )}
                    {consoleOutput?.stdout && (
                      <pre className="whitespace-pre-wrap text-slate-100">{consoleOutput.stdout}</pre>
                    )}
                    {consoleOutput?.stderr && (
                      <pre className="text-red-400 whitespace-pre-wrap">{consoleOutput.stderr}</pre>
                    )}
                    {consoleOutput?.error && (
                      <pre className="text-red-400 whitespace-pre-wrap">{consoleOutput.error}</pre>
                    )}
                    {!runningCode && !consoleOutput?.stdout && !consoleOutput?.stderr && !consoleOutput?.error && (
                      <span className="text-slate-400">Finished with no output.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {turns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The agent's steps will appear here once you run it.
                </p>
              ) : (
                turns
                  .filter((t) => t.role === 'agent' && t.steps?.length)
                  .map((t) => (
                    <div key={t.id} className="space-y-2">
                      {t.steps!.map((s) => (
                        <div
                          key={s.step}
                          className="rounded-2xl border border-border/70 bg-card p-4 text-xs"
                          data-testid={`step-${s.step}`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
                            <CheckCircle2 className="h-3 w-3" /> Step {s.step}
                          </div>
                          <div className="text-foreground/90 font-mono whitespace-pre-wrap">
                            {s.thought}
                          </div>
                          {s.summary && (
                            <div className="mt-2 pt-2 border-t border-border/60 text-muted-foreground">
                              <Wand2 className="inline h-3 w-3 mr-1" />
                              {s.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  testid,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  testid: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon} {label}
    </button>
  )
}

function AgentBubble({ turn }: { turn: AgentTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border border-border/70 text-foreground',
        )}
        data-testid={isUser ? 'agent-msg-user' : 'agent-msg-bot'}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Bot className="h-3 w-3" /> Agent
          </div>
        )}
        {turn.content}
        {turn.steps && turn.steps.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Play className="h-3 w-3" /> {turn.steps.length} step(s) executed — switch to the
            Steps tab on the right to inspect.
          </div>
        )}
      </div>
    </div>
  )
}

