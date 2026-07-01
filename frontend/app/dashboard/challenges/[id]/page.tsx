'use client'

import { useEffect, useState } from 'react'
import { ChallengeEditor } from '@/components/challenges/challenge-editor'
import { Loader2 } from 'lucide-react'

interface ChallengeData {
  id: string
  title: string
  description: string
  examples: Array<{ input: string; output: string; explanation?: string }>
  initialCode: string
}

export default function ChallengePage({ params }: { params: { id: string } }) {
  const challengeId = params.id
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/challenges/${challengeId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setChallenge(data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [challengeId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Challenge not found.</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ChallengeEditor
        challengeId={challenge.id}
        title={challenge.title}
        description={challenge.description}
        examples={challenge.examples}
        initialCode={challenge.initialCode}
      />
    </div>
  )
}
