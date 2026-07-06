'use client'

import * as React from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background p-6 font-mono text-foreground antialiased">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 className="text-xl font-bold text-destructive mb-2">Application Error</h2>
          <p className="text-sm text-muted-foreground mb-4">
            A critical error occurred. Please try reloading the page.
          </p>
          {error.digest && (
            <code className="block rounded bg-muted p-2 text-xs font-mono mb-4 truncate">
              Digest: {error.digest}
            </code>
          )}
          <button
            onClick={() => reset()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
