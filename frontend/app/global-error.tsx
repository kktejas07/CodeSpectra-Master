'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div style={{
          display: 'flex', minHeight: '100vh', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          fontFamily: 'monospace', margin: 0, background: '#09090b', color: '#fafafa',
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>
            Application Error
          </h2>
          <p style={{ color: '#a1a1aa', margin: '0.5rem 0' }}>
            A critical error occurred. Please try reloading the page.
          </p>
          {error.digest && <code style={{ fontSize: '0.75rem', color: '#71717a' }}>Digest: {error.digest}</code>}
          <button onClick={() => reset()} style={{
            marginTop: '1rem', padding: '0.5rem 1rem', background: '#fafafa',
            color: '#09090b', border: 'none', borderRadius: '0.375rem', cursor: 'pointer',
          }}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
