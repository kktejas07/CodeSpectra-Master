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
  const [createdUsers, setCreatedUsers] = useState<any[]>([])

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
        setCreatedUsers(data.users || [])
        setSuccess(true)
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/auth/login')
        }, 3000)
      } else {
        const errorMsg = data.error || 'Setup failed. Please try again.'
        setError(errorMsg)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred during setup.'
      setError(`Connection error: ${errorMsg}. Please check your Supabase configuration.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center shadow-lg">
              <Code2 className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">CodeSpectra</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Initial Setup</h1>
            <p className="text-muted-foreground mt-1">Set up the demo account to start testing</p>
          </div>
        </div>

        {/* Content Card */}
        <div className="bg-card border border-border/50 rounded-lg p-6 space-y-4 shadow-lg">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Setup Failed</p>
                <p className="text-sm text-destructive/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Setup Complete!</p>
                <p className="text-sm text-green-600 mt-1">Demo accounts created. Redirecting to login...</p>
              </div>
            </div>
          )}

          {success && createdUsers && createdUsers.length > 0 && (
            <div className="bg-muted/50 border border-border/50 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Created Demo Accounts:</p>
              <div className="space-y-2">
                {createdUsers.map((user, index) => (
                  <div key={index} className="bg-background border border-border/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white capitalize bg-primary px-2 py-1 rounded">
                        {user.role}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{user.full_name}</span>
                    </div>
                    <div className="space-y-1 font-mono text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="text-primary font-semibold">{user.email}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Password:</span>
                        <span className="text-primary font-semibold">{user.password}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!success && (
            <>
              <div className="space-y-3 text-sm">
                <h2 className="font-semibold text-foreground">This will:</h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 font-bold mt-0.5">✓</span>
                    <span>Create a Superadmin account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 font-bold mt-0.5">✓</span>
                    <span>Create a Tenant Admin account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 font-bold mt-0.5">✓</span>
                    <span>Create a Demo User account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 font-bold mt-0.5">✓</span>
                    <span>Initialize user profiles in the database</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 font-bold mt-0.5">✓</span>
                    <span>Allow you to test all platform features</span>
                  </li>
                </ul>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border/50">
                <p className="text-xs font-semibold text-foreground">Demo Account Details:</p>
                <div className="space-y-2">
                  <div className="bg-background border border-border/30 rounded p-2.5">
                    <div className="text-xs font-semibold text-primary mb-1">SUPERADMIN</div>
                    <div className="text-xs space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="text-foreground">superadmin@codespectra.com</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Password:</span>
                        <span className="text-foreground">SuperAdmin123!</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-background border border-border/30 rounded p-2.5">
                    <div className="text-xs font-semibold text-primary mb-1">TENANT ADMIN</div>
                    <div className="text-xs space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="text-foreground">admin@codespectra.com</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Password:</span>
                        <span className="text-foreground">TenantAdmin123!</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-background border border-border/30 rounded p-2.5">
                    <div className="text-xs font-semibold text-primary mb-1">DEMO USER</div>
                    <div className="text-xs space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="text-foreground">demo@codespectra.com</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Password:</span>
                        <span className="text-foreground">DemoPass123!</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSetup}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Start Setup'
                )}
              </button>
            </>
          )}
        </div>

        {/* Troubleshooting Info */}
        {error && (
          <div className="bg-muted/50 border border-border/50 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Troubleshooting Tips:</p>
            <ul className="text-xs space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary font-bold flex-shrink-0">1.</span>
                <span>Ensure your Supabase project URL and API keys are configured in environment variables</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold flex-shrink-0">2.</span>
                <span>Check that SUPABASE_SERVICE_ROLE_KEY is set in your .env.local file</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold flex-shrink-0">3.</span>
                <span>Try clicking "Start Setup" again - the demo user may already exist</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold flex-shrink-0">4.</span>
                <span>If it still fails, manually sign up with any email/password to test</span>
              </li>
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
