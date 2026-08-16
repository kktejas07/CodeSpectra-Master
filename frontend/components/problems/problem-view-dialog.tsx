'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface TestCase {
  id: string
  stdin: string
  expected_stdout: string
  is_sample: boolean
}

interface ProblemDetail {
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
  test_cases: TestCase[]
  hidden_test_count?: number
  time_limit_ms?: number
  memory_limit_kb?: number
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  )
}

function TcBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <pre className="rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words">{value || '(empty)'}</pre>
    </div>
  )
}

/**
 * ProblemViewDialog — shows the full problem statement (markdown), input /
 * output format, constraints and sample test cases in a modal, so event
 * organizers can read a problem in detail before committing it to a hackathon.
 */
export function ProblemViewDialog({
  open,
  onClose,
  slug,
}: {
  open: boolean
  onClose: () => void
  slug: string | null
}) {
  const [prob, setProb] = useState<ProblemDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSamples, setShowSamples] = useState(true)

  useEffect(() => {
    if (!open || !slug) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProb(null)
    setShowSamples(true)
    fetch(`/api/problems/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (!j || !j.title) throw new Error(j.error || 'Problem not found')
        setProb(j as ProblemDetail)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, slug])

  const samples = (prob?.test_cases || []).filter((t) => t.is_sample)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left">
            <span className="truncate">{prob?.title || 'Problem'}</span>
            {prob && (
              <Badge variant={prob.difficulty === 'easy' ? 'default' : prob.difficulty === 'medium' ? 'secondary' : 'destructive'}>
                {prob.difficulty}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading problem…
          </div>
        )}

        {error && <p className="py-6 text-sm text-destructive">{error}</p>}

        {prob && !loading && !error && (
          <div className="space-y-5">
            {prob.topics && prob.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {prob.topics.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">{t}</Badge>
                ))}
              </div>
            )}

            <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-h2:text-lg prose-h3:text-base prose-p:text-sm prose-p:leading-relaxed prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted/60 prose-pre:rounded-md prose-a:text-primary prose-li:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {prob.statement_md || '_No statement provided._'}
              </ReactMarkdown>
            </div>

            {prob.input_format && (
              <Section title="Input format">
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{prob.input_format}</p>
              </Section>
            )}
            {prob.output_format && (
              <Section title="Output format">
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{prob.output_format}</p>
              </Section>
            )}
            {prob.constraints && (
              <Section title="Constraints">
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{prob.constraints}</p>
              </Section>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowSamples((s) => !s)}
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Sample test cases ({samples.length})
                {showSamples ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showSamples && (
                <div className="space-y-2">
                  {samples.length === 0 && <p className="text-xs text-muted-foreground">No sample test cases.</p>}
                  {samples.map((tc, i) => (
                    <div key={tc.id || i} className="rounded-md border border-border/60 p-2.5">
                      <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Sample {i + 1}</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <TcBlock label="Input" value={tc.stdin} />
                        <TcBlock label="Expected output" value={tc.expected_stdout} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
              {typeof prob.time_limit_ms === 'number' && <span>{prob.time_limit_ms} ms time limit</span>}
              {typeof prob.memory_limit_kb === 'number' && <span>{Math.round(prob.memory_limit_kb / 1024)} MB memory</span>}
              {typeof prob.hidden_test_count === 'number' && <span>{prob.hidden_test_count} hidden test cases</span>}
              <span className="ml-auto">
                <Link
                  href={`/dashboard/problems/${prob.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open in arena <ExternalLink className="h-3 w-3" />
                </Link>
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}