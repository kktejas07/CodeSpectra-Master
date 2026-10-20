'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { ChallengeEditor } from '@/components/challenges/challenge-editor'
import { Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'

interface ProblemData {
  id: string
  slug: string
  title: string
  difficulty: string
  statement_md?: string
  input_format?: string
  output_format?: string
  constraints?: string
  test_cases: Array<{ stdin?: string; expected_stdout?: string; is_sample?: boolean }>
  starter_code?: Record<string, string>
  time_limit_ms?: number
  memory_limit_kb?: number
}

interface ChallengeData {
  id: string
  title: string
  description: string
  examples: Array<{ input: string; output: string; explanation?: string }>
  initialCode: string
  problem_slug?: string
  hackathonId?: string
}

export default function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = usePageGuard('user')

  const { id: challengeId } = use(params)
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [problem, setProblem] = useState<ProblemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const chRes = await fetch(`/api/challenges/${challengeId}`, { credentials: 'include' })
        const chData = await chRes.json()
        if (chData && !chData.error) {
          setChallenge(chData)
        }
      } catch {}
      try {
        const prRes = await fetch(`/api/problems/${challengeId}`, { credentials: 'include' })
        if (prRes.ok) {
          const prData = await prRes.json()
          if (prData && !prData.error) {
            setProblem(prData)
          }
        }
      } catch {}
      setLoading(false)
    }
    void load()
  }, [challengeId, reloadKey])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <SkeletonText lines={2} />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (!gate.ready) return null

  if (!challenge && !problem) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <EmptyState
          illustration="error"
          title="Couldn't load this challenge"
          description="It may have been removed, or your connection dropped. Try again or go back to the challenge list."
          actionLabel="Try again"
          onAction={() => setReloadKey((k) => k + 1)}
        />
        <p className="mt-4 text-center text-sm">
          <Link href="/dashboard/challenges" className="text-primary hover:underline">Back to challenges</Link>
        </p>
      </div>
    )
  }

  const title = problem?.title || challenge?.title || challengeId
  const description = problem?.statement_md || challenge?.description || ''
  const initialCode = problem?.starter_code?.javascript || challenge?.initialCode || ''

  const examples = problem?.test_cases
    ?.filter((t) => t.is_sample !== false)
    .map((t) => ({
      input: t.stdin || '',
      output: t.expected_stdout || '',
    })) || challenge?.examples || []

  const constraints = problem?.constraints || ''
  const inputFormat = problem?.input_format || ''
  const outputFormat = problem?.output_format || ''

  return (
    <div className="h-[calc(100vh-4rem)] w-full overflow-hidden">
      <ChallengeEditor
        challengeId={challenge?.id || challengeId}
        title={title}
        description={description}
        descriptionComponent={
          problem?.statement_md ? (
            <div
              className="prose prose-sm max-w-none text-foreground leading-relaxed prose-headings:text-foreground prose-p:text-muted-foreground prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-strong:text-foreground prose-li:text-muted-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border/40 prose-pre:rounded-lg prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:marker:text-muted-foreground"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
            </div>
          ) : null
        }
        examples={examples}
        initialCode={initialCode}
        problemSlug={problem?.slug || challenge?.problem_slug || challengeId}
        hackathonId={challenge?.hackathonId}
        constraints={constraints}
        inputFormat={inputFormat}
        outputFormat={outputFormat}
        timeLimitMs={problem?.time_limit_ms ?? null}
        memoryLimitKb={problem?.memory_limit_kb ?? null}
      />
    </div>
  )
}