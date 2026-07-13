'use client'

import { useEffect, useState, use } from 'react'
import { ChallengeEditor } from '@/components/challenges/challenge-editor'
import { Loader2 } from 'lucide-react'

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
  const { id: challengeId } = use(params)
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [problem, setProblem] = useState<ProblemData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
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
  }, [challengeId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const title = problem?.title || challenge?.title || challengeId
  const description = (problem?.statement_md || challenge?.description || '').replace(/[#*`_]/g, '')
  const initialCode = problem?.starter_code?.javascript || challenge?.initialCode || ''

  const examples = problem?.test_cases
    ?.filter((t) => t.is_sample !== false)
    .map((t) => ({
      input: t.stdin || '',
      output: t.expected_stdout || '',
    })) || challenge?.examples || []

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ChallengeEditor
        challengeId={challenge?.id || challengeId}
        title={title}
        description={description}
        examples={examples}
        initialCode={initialCode}
        problemSlug={problem?.slug || challenge?.problem_slug || challengeId}
      />
    </div>
  )
}