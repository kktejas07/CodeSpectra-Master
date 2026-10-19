'use client'

import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { SoftGlow } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  retry?: () => void
}) {
  return (
    <div role="alert" className="relative isolate flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <SoftGlow />
      <Illustration name="error" className="mb-6 w-56" />
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        This section didn’t load. Your work is saved — try again, or head back home.
      </p>
      {error?.digest && (
        <p className="mt-4 text-xs text-muted-foreground">
          Reference: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{error.digest}</code>
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => (retry ?? reset)()} className="gap-2 rounded-full px-6">
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full px-6">
          <Link href="/status">Check system status</Link>
        </Button>
      </div>
    </div>
  )
}
