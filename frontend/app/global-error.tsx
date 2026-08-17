'use client'

const containerStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  margin: 0,
  padding: '2rem',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center'
}

const h2Style: React.CSSProperties = {
  color: '#ef4444',
  marginBottom: '0.5rem'
}

const pStyle: React.CSSProperties = {
  color: '#6b7280',
  marginBottom: '1.5rem'
}

const codeStyle: React.CSSProperties = {
  background: '#f3f4f6',
  padding: '0.25rem 0.5rem',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  display: 'block',
  marginBottom: '1rem'
}

export default function GlobalErrorPage({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <html>
      <head />
      <body>
        <div style={containerStyle}>
          <h2 style={h2Style}>Something went wrong</h2>
          <p style={pStyle}>We encountered an unexpected issue.</p>
          {error?.digest && (
            <code style={codeStyle}>
              Digest: {error.digest}
            </code>
          )}
        </div>
      </body>
    </html>
  )
}