'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Code2, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function SetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const response = await fetch('/api/setup-demo', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/auth/login')
        }, 2000)
      } else {
        setError(data.error || 'Setup failed. Please try again.')
      }
    } catch (err) {
      setError('An error occurred during setup. Please try again.')
      console.error('Setup error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-3xl font-bold text-foreground">CodeSpectra</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Initial Setup</h1>
          <p className="text-foreground/60">Set up the demo account to start testing</p>
        </div>

        {/* Content Card */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Setup Failed</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Setup Complete!</p>
                <p className="text-sm text-green-600">Demo account created. Redirecting to login...</p>
              </div>
            </div>
          )}

          {!success && (
            <>
              <div className="space-y-3 text-sm">
                <h2 className="font-semibold text-foreground">This will:</h2>
                <ul className="space-y-2 text-foreground/70">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Create a demo user account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Initialize user profile in the database</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>Allow you to test all platform features</span>
                  </li>
                </ul>
              </div>

              <div className="bg-background/50 rounded p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Demo Account Details:</p>
                <div className="text-xs space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-foreground/60">Email:</span>
                    <span className="text-primary">demo@codespectra.com</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground/60">Password:</span>
                    <span className="text-primary">DemoPass123!</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSetup}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Start Setup'
                )}
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-foreground/60">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
