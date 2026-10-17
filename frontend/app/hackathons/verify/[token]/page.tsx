'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, XCircle, Trophy, Users, Award } from 'lucide-react'

interface Verification {
  valid: boolean
  event?: string
  team?: string
  members?: string[]
  xp?: number
  released_at?: string
  error?: string
}

export default function VerifyCertPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<Verification | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/hackathons/verify/${token}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ valid: false, error: 'Verification failed' }))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-3xl border-border/70 p-8 text-center space-y-4">
        {data?.valid ? (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-600 dark:text-green-400" />
            <h1 className="text-xl font-bold">Certificate verified</h1>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><strong>Event:</strong> {data.event}</p>
              <p><strong>Team:</strong> {data.team}</p>
              <div className="flex items-center justify-center gap-2">
                <Users className="h-4 w-4" />
                <span>{data.members?.join(', ') || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Award className="h-4 w-4" />
                <span className="tabular-nums">{data.xp} XP</span>
              </div>
            </div>
            <Badge variant="outline" className="text-green-700 dark:text-green-400 border-green-500/40 bg-green-500/10">
              Verified on CodeSpectra
            </Badge>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="text-xl font-bold">Certificate not found</h1>
            <p className="text-sm text-muted-foreground">
              {data?.error || 'This certificate could not be verified.'}
            </p>
          </>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/">
            <Trophy className="mr-2 h-4 w-4" /> Powered by CodeSpectra
          </Link>
        </Button>
      </Card>
    </div>
  )
}
