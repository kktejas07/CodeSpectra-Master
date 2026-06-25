'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Code2, Play, CheckCircle, ArrowRight, Sparkles, Database } from 'lucide-react'
import { getArenaChallenge, getNextArenaChallengeId, type ArenaChallenge } from '@/lib/arena-challenges'
import { PROGRAMMING_LANGUAGES } from '@/lib/languages'

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
        } catch {
          stack = []
        }
        const res = await fetch('/api/arena/adapt', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: id, userStack: Array.isArray(stack) ? stack : [] }),
          signal: ac.signal,
        })
        const json = (await res.json()) as {
          source?: string
          challenge?: ArenaChallenge
          notice?: string
        }
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
    () => PROGRAMMING_LANGUAGES.filter((l) => ['javascript', 'typescript', 'python', 'java', 'cpp'].includes(l.id)),
    []
  )

  const [language, setLanguage] = useState(languageOptions[0]?.id ?? 'javascript')
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<{ passed: number; total: number; runtime: string; memory: string } | null>(
    null
  )
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!challenge) return
    setCode(challenge.defaultCode[language] ?? challenge.defaultCode.javascript ?? '')
  }, [challenge, language])

  const handleRun = async () => {
    await new Promise((r) => setTimeout(r, 400))
  }

  const handleSubmit = async () => {
    setSubmitted(true)
    setResults(null)
    await new Promise((r) => setTimeout(r, 700))
    setResults({ passed: 5, total: 5, runtime: '45ms', memory: '42.5MB' })
    setSubmitted(false)
    if (nextId) {
      window.setTimeout(() => {
        router.push(`/dashboard/arena/${nextId}`)
      }, 1400)
    }
  }

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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Code2 className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">{challenge.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={diffStyles[challenge.difficulty] ?? ''}>{challenge.difficulty.toUpperCase()}</Badge>
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

      <Alert className="border-border/60 bg-muted/30">
        <AlertTitle>Hybrid question pipeline</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Each challenge loads from <strong className="text-foreground">curated seeds</strong> in{' '}
          <code className="rounded bg-muted px-1 text-xs">lib/arena-challenges.ts</code>. On open, the app calls{' '}
          <code className="rounded bg-muted px-1 text-xs">POST /api/arena/adapt</code> to request an{' '}
          <strong className="text-foreground">LLM variant</strong> when <code className="text-xs">OPENAI_API_KEY</code>{' '}
          is set (otherwise the seed is returned). A real HackerRank-style system still needs a secure runner and tests;
          this layer only rewrites the prompt text.
        </AlertDescription>
        {adaptNotice ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{adaptNotice}</p> : null}
      </Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 border-border/60 p-6">
          <h2 className="font-semibold text-foreground">Problem</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {challenge.statement.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
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
              {challenge.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {languageOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Code</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-96 w-full resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleRun()} variant="outline" className="min-w-[120px] flex-1">
              <Play className="mr-2 h-4 w-4" />
              Run
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitted} className="min-w-[120px] flex-1">
              {submitted ? 'Judging…' : 'Submit'}
            </Button>
          </div>

          {results && (
            <Card className="space-y-2 border border-green-500/30 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">All tests passed</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {nextId ? 'Next challenge opens in a moment…' : 'That was the last challenge in this set. Nice work.'}
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div>
                  <p className="text-xs text-muted-foreground/80">Tests</p>
                  <p className="font-semibold text-foreground">
                    {results.passed}/{results.total}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground/80">Runtime</p>
                  <p className="font-semibold text-foreground">{results.runtime}</p>
                </div>
              </div>
              {!nextId ? (
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/dashboard/arena">Back to list</Link>
                </Button>
              ) : null}
            </Card>
          )}

          {nextId && (
            <Button asChild variant="ghost" className="w-full gap-2 text-muted-foreground">
              <Link href={`/dashboard/arena/${nextId}`}>
                Skip to next
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ArenaChallengePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">Loading challenge…</div>
      }
    >
      <ArenaChallengeInner />
    </Suspense>
  )
}
