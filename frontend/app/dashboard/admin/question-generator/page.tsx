'use client'

import { useState } from 'react'
import { Loader2, Sparkles, FileCheck2, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { DIFFICULTY_LEVELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'

type Diff = (typeof DIFFICULTY_LEVELS)[number]

interface GenResult {
  problem: Record<string, unknown>
  published_problem_id: string | null
}

export default function QuestionGeneratorPage() {
  const gate = usePageGuard('superadmin')

  const [role, setRole] = useState('Backend Engineer')
  const [difficulty, setDifficulty] = useState<Diff>('intermediate')
  const [topics, setTopics] = useState('arrays, hash maps')
  const [language, setLanguage] = useState('python')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [publish, setPublish] = useState(true)

  if (!gate.ready) return null

  async function generate() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const res = await csrfFetch('/api/ai/generate-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          difficulty,
          topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
          language_hint: language,
          publish,
        }),
      })
      const j = (await res.json()) as GenResult & { error?: string }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setResult(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="qgen-page">
      <div>
        <h1 className="text-2xl font-bold">AI Question Generator
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-62.5">Generate fresh coding interview problems on demand &mdash; tuned for the role you&apos;re hiring for. Optionally publish straight to the Problems library.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-3">
          <Field label="Role / job title">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              data-testid="qgen-role"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>
          <Field label="Difficulty">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Diff)}
              data-testid="qgen-difficulty"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm"
            >
              {DIFFICULTY_LEVELS.map((lv) => (
                <option key={lv} value={lv}>{DIFFICULTY_LABELS[lv]}</option>
              ))}
            </select>
          </Field>
          <Field label="Topics (comma-separated)">
            <input
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              data-testid="qgen-topics"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm"
              placeholder="arrays, dynamic programming, trees"
            />
          </Field>
          <Field label="Starter code language">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              data-testid="qgen-language"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm"
            >
              {['python', 'javascript', 'typescript', 'java', 'cpp', 'go'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              data-testid="qgen-publish"
            />
            Publish to /problems immediately
          </label>
          <Button onClick={generate} disabled={busy} data-testid="qgen-run" className="w-full">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" /> Generate problem
              </>
            )}
          </Button>
          {err && (
            <div className="rounded border border-destructive/40 bg-destructive/10 text-destructive p-2 text-xs">
              {err}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-5 overflow-hidden">
          <div className="text-sm font-semibold mb-3">Result</div>
          {!result ? (
            <p className="text-xs text-muted-foreground">
              Generated problem will appear here. Publish to push it live to all candidates.
            </p>
          ) : (
            <div className="space-y-4">
              {result.published_problem_id && (
                <div className="rounded-md border border-primary/30 bg-primary/10 text-primary p-2 text-xs flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4" />
                  Published — open it at{' '}
                  <a
                    href={`/dashboard/problems/${(result.problem as { slug?: string }).slug || ''}`}
                    className="underline"
                    data-testid="qgen-open-link"
                  >
                    /dashboard/problems/{(result.problem as { slug?: string }).slug || '...'}
                  </a>
                </div>
              )}

              <div className="space-y-3">
                {(result.problem as { title?: string }).title && (
                  <div>
                    <h3 className="text-lg font-bold">{(result.problem as { title?: string }).title}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(result.problem as { difficulty?: string }).difficulty && (() => {
                        const dl = toDifficultyLevel((result.problem as { difficulty?: string }).difficulty)
                        return (
                          <Badge variant="outline" className={dl ? DIFFICULTY_COLORS[dl] : 'border-border text-muted-foreground'}>
                            {dl ? DIFFICULTY_LABELS[dl] : (result.problem as { difficulty?: string }).difficulty}
                          </Badge>
                        )
                      })()}
                      {Array.isArray((result.problem as { topics?: string[] }).topics) &&
                        (result.problem as { topics?: string[] }).topics!.map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))
                      }
                    </div>
                  </div>
                )}

                {(result.problem as { description?: string }).description && (
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Description</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {(result.problem as { description?: string }).description}
                    </p>
                  </div>
                )}

                {Array.isArray((result.problem as { test_cases?: Array<{ input: string; output: string; explanation?: string }> }).test_cases) &&
                  (result.problem as { test_cases?: Array<{ input: string; output: string; explanation?: string }> }).test_cases!.length > 0 && (
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-3 py-2 bg-muted/30 border-b border-border/60">Test Cases</p>
                    <div className="divide-y divide-border/60">
                      {(result.problem as { test_cases?: Array<{ input: string; output: string; explanation?: string }> }).test_cases!.map((tc: { input: string; output: string; explanation?: string }, i: number) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 px-3 py-2 text-xs">
                          <div>
                            <span className="text-muted-foreground font-medium">Input: </span>
                            <code className="font-mono text-foreground">{tc.input}</code>
                          </div>
                          <div>
                            <span className="text-muted-foreground font-medium">Output: </span>
                            <code className="font-mono text-foreground">{tc.output}</code>
                          </div>
                          {tc.explanation && (
                            <div className="text-muted-foreground italic">{tc.explanation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.problem && (() => {
                  const sc = (result.problem as unknown as { starter_code?: Record<string, string> | string }).starter_code
                  const isMap = typeof sc === 'object' && sc !== null
                  if (!sc || (typeof sc === 'string' && !sc.trim()) || (isMap && Object.keys(sc).length === 0)) return null
                  return (
                    <div className="rounded-lg border border-border/60 overflow-hidden">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-3 py-2 bg-muted/30 border-b border-border/60">
                        Starter Code
                        {!isMap && (result.problem as unknown as { language?: string }).language && (
                          <span className="ml-2 normal-case tracking-normal">{(result.problem as unknown as { language?: string }).language}</span>
                        )}
                      </p>
                      {isMap ? (
                        <div className="divide-y divide-border/60">
                          {Object.entries(sc as Record<string, string>).map(([lang, code]) => (
                            <div key={lang}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2">{lang}</p>
                              <pre className="text-xs font-mono p-3 overflow-x-auto whitespace-pre-wrap wrap-break-word">{code || '(no starter)'}</pre>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <pre className="text-xs font-mono p-3 overflow-x-auto whitespace-pre-wrap wrap-break-word">{sc as string}</pre>
                      )}
                    </div>
                  )
                })()}

                {!((result.problem as { title?: string }).title) && (
                  <pre
                    className="text-[11px] whitespace-pre-wrap wrap-break-word font-mono max-h-[480px] overflow-y-auto rounded border border-border bg-background/40 p-3"
                    data-testid="qgen-result"
                  >
                    {JSON.stringify(result.problem, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  )
}


