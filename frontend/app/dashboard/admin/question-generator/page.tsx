'use client'

import { useState } from 'react'
import { Loader2, Sparkles, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'

type Diff = 'easy' | 'medium' | 'hard'

interface GenResult {
  problem: Record<string, unknown>
  published_problem_id: string | null
}

export default function QuestionGeneratorPage() {
  const gate = usePageGuard('superadmin')

  const [role, setRole] = useState('Backend Engineer')
  const [difficulty, setDifficulty] = useState<Diff>('medium')
  const [topics, setTopics] = useState('arrays, hash maps')
  const [language, setLanguage] = useState('python')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [publish, setPublish] = useState(true)

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  async function generate() {
    setBusy(true)
    setErr(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/generate-problem', {
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
        <h1 className="text-2xl font-bold">AI Question Generator</h1>
        <p className="text-sm text-muted-foreground">
          Generate fresh coding interview problems on demand — tuned for the role you&apos;re
          hiring for. Optionally publish straight to the Problems library.
        </p>
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
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
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
            <div className="space-y-3">
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
              <pre
                className="text-[11px] whitespace-pre-wrap break-words font-mono max-h-[480px] overflow-y-auto rounded border border-border bg-background/40 p-3"
                data-testid="qgen-result"
              >
                {JSON.stringify(result.problem, null, 2)}
              </pre>
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
