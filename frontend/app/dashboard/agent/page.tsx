'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  Code2,
  Cpu,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Terminal,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

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

/**
 * Agent Workspace — Emergent-style two-pane layout:
 *   LEFT  : chat with the agentic AI (multi-step planner)
 *   RIGHT : live Monaco editor showing the code as the agent edits it
 */
export default function AgentPage() {
  const [language, setLanguage] = useState<string>('python')
  const [code, setCode] = useState<string>(STARTER_CODE)
  const [input, setInput] = useState<string>('')
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [maxSteps, setMaxSteps] = useState(3)
  const [activeTab, setActiveTab] = useState<'code' | 'log'>('code')
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [turns])

  async function runAgent() {
    const goal = input.trim()
    if (!goal || busy) return
    setInput('')
    const userTurn: AgentTurn = { id: `u-${Date.now()}`, role: 'user', content: goal }
    setTurns((t) => [...t, userTurn])
    setBusy(true)
    try {
      const res = await fetch('/api/ai/agent', {
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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-linear-to-br from-primary to-primary/70 shadow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Agent Workspace</h1>
            <p className="text-xs text-muted-foreground">
              Multi-step coding agent · Claude Sonnet 4.5
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            data-testid="agent-lang"
          >
            {LANGS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            data-testid="agent-steps"
          >
            <option value={1}>1 step</option>
            <option value={2}>2 steps</option>
            <option value={3}>3 steps</option>
            <option value={4}>4 steps</option>
            <option value={5}>5 steps</option>
          </select>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* LEFT — chat */}
        <section className="w-full lg:w-[44%] xl:w-[40%] flex flex-col border-r border-border bg-card/20">
          <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {turns.length === 0 && (
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bot className="h-4 w-4 text-primary" />
                  Tell the agent what to do
                </div>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• &quot;Refactor for O(n) using memoization&quot;</li>
                  <li>• &quot;Add input validation and a docstring&quot;</li>
                  <li>• &quot;Translate this to TypeScript&quot;</li>
                  <li>• &quot;Add 3 edge-case unit tests&quot;</li>
                </ul>
              </div>
            )}
            {turns.map((t) => (
              <AgentBubble key={t.id} turn={t} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Agent is thinking — {maxSteps} step plan
              </div>
            )}
          </div>
          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void runAgent()
            }}
            className="border-t border-border p-3"
          >
            <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2">
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
                placeholder="Describe the goal — e.g. 'Refactor to iterative and add memoization'"
                className="flex-1 resize-none bg-transparent text-sm font-mono focus:outline-none"
                data-testid="agent-input"
                disabled={busy}
              />
              <Button
                type="submit"
                size="icon"
                disabled={busy || !input.trim()}
                data-testid="agent-run"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5">
              <span>⌘ + Enter to run</span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Agentic loop
              </span>
            </div>
          </form>
        </section>

        {/* RIGHT — workspace */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-1 border-b border-border bg-card/30 px-3">
            <TabButton
              active={activeTab === 'code'}
              onClick={() => setActiveTab('code')}
              icon={<Code2 className="h-3.5 w-3.5" />}
              label="Code"
              testid="tab-code"
            />
            <TabButton
              active={activeTab === 'log'}
              onClick={() => setActiveTab('log')}
              icon={<Terminal className="h-3.5 w-3.5" />}
              label="Steps"
              testid="tab-log"
            />
            <span className="ml-auto text-[10px] text-muted-foreground py-2">
              <FileText className="inline h-3 w-3 mr-1" />
              workspace.{language}
            </span>
          </div>

          {activeTab === 'code' ? (
            <div className="flex-1 min-h-0">
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
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-card/10">
              {turns.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Step-by-step thoughts will appear here once you run the agent.
                </p>
              ) : (
                turns
                  .filter((t) => t.role === 'agent' && t.steps?.length)
                  .map((t) => (
                    <div key={t.id} className="space-y-2">
                      {t.steps!.map((s) => (
                        <div
                          key={s.step}
                          className="rounded-md border border-border bg-card/40 p-3 text-xs"
                          data-testid={`step-${s.step}`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-primary text-[10px] uppercase tracking-wide">
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
        'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition',
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
          'max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/50 border border-border/60 text-foreground',
        )}
        data-testid={isUser ? 'agent-msg-user' : 'agent-msg-bot'}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-primary mb-1">
            <Bot className="h-3 w-3" /> Agent
          </div>
        )}
        {turn.content}
        {turn.steps && turn.steps.length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
            <Play className="h-3 w-3" /> {turn.steps.length} step(s) executed — switch to the
            Steps tab on the right to inspect.
          </div>
        )}
      </div>
    </div>
  )
}
