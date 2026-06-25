'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { exchangeGitHubCode } from '@/lib/github-service'
import { Button } from '@/components/ui/button'

function GitHubOAuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Connecting your GitHub account…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const err = searchParams.get('error_description') || searchParams.get('error')

    if (err) {
      setError(String(err))
      setMessage('')
      return
    }

    if (!code || !state) {
      setError('Missing code or state from GitHub. Close this tab and try Connect again from the scanner.')
      setMessage('')
      return
    }

    void (async () => {
      try {
        await exchangeGitHubCode(code, state)
        router.replace('/dashboard/scanner?mode=github')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'GitHub connection failed')
        setMessage('')
      }
    })()
  }, [router, searchParams])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      {message && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p>{message}</p>
        </div>
      )}
      {error && (
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <div className="flex justify-center text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="mt-2 text-sm text-destructive">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/dashboard/scanner?mode=github')}>
            Back to scanner
          </Button>
        </div>
      )}
    </div>
  )
}

export default function GitHubOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <GitHubOAuthCallbackInner />
    </Suspense>
  )
}
