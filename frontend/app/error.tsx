'use client'

import { useEffect } from 'react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error if needed
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center font-mono">
      <h2 className="text-xl font-bold text-destructive mb-2">Something went wrong</h2>
      <p className="text-muted-foreground text-sm max-w-md mb-4">
        We encountered an unexpected issue while loading this section.
      </p>
      {error?.digest && (
        <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded mb-4">
          Digest: {error.digest}
        </code>
      )}
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
