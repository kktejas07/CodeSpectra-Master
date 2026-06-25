'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, Github, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { signIn } from '@/lib/auth-service'
import { supabase } from '@/lib/supabase-client'
import { getDefaultDashboard, normalizeUserRole } from '@/lib/rbac'

async function fetchProfileRoleWithRetry(
  userId: string,
  metadataRole?: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    if (data?.role && !error) return data.role as string
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
  }
  return metadataRole || null
}

export default function Login() {
  const router = useRouter()
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authMethod, setAuthMethod] = useState<'face' | 'email' | null>(null)
  const [email, setEmail] = useState('')
  const [faceEmail, setFaceEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [demoUsers, setDemoUsers] = useState<any[]>([])

  const [mfaStep, setMfaStep] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  const handleFaceCapture = async (faceData: { front: string; left: string; right: string }) => {
    const fe = faceEmail.trim().toLowerCase()
    if (!fe.includes('@')) {
      setError('Enter the email on your account before scanning.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fe, faceData }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Face not recognized. Try again or use email sign-in.')
        return
      }

      if (data.token_hash && typeof data.token_hash === 'string') {
        let authErr = (
          await supabase.auth.verifyOtp({
            type: 'email',
            token_hash: data.token_hash,
          })
        ).error
        if (authErr) {
          authErr = (
            await supabase.auth.verifyOtp({
              type: 'magiclink',
              token_hash: data.token_hash,
            })
          ).error
        }
        if (authErr) {
          setError(authErr.message || 'Could not complete sign-in. Use email and password instead.')
          return
        }
      }

      if (data.userId) {
        const rawRole = await fetchProfileRoleWithRetry(data.userId)
        const role = normalizeUserRole(rawRole)
        const redirectPath = getDefaultDashboard(role)
        setTimeout(() => router.push(redirectPath), 300)
      } else {
        setTimeout(() => router.push(getDefaultDashboard('user')), 300)
      }
    } catch (err) {
      setError('An error occurred during face recognition.')
    } finally {
      setLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)
      
      if (result.success) {
        if (result.user) {
          const meta =
            (result.user.user_metadata as { role?: string } | undefined)?.role

          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors()
          if (factorsErr) {
            console.warn('[CodeSpectra] listFactors after login:', factorsErr.message)
          }

          const rawTotp = factorsData?.totp ?? []
          const fromAll =
            (factorsData as { all?: { status?: string; factor_type?: string; id: string }[] })?.all?.filter(
              (f) => f.factor_type === 'totp'
            ) ?? []
          const totpFactorsList = rawTotp.length > 0 ? rawTotp : fromAll
          const totpVerified = totpFactorsList.filter((f: { status?: string }) => f.status === 'verified')

          if (
            totpVerified.length > 0 &&
            aal?.currentLevel === 'aal1' &&
            aal?.nextLevel === 'aal2'
          ) {
            const factor = totpVerified[0] as { id: string }
            const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
              factorId: factor.id,
            })
            if (chErr || !challenge?.id) {
              setError(chErr?.message || 'Could not start two-factor verification.')
              return
            }
            setMfaFactorId(factor.id)
            setMfaChallengeId(challenge.id)
            setMfaStep(true)
            setMfaCode('')
            return
          }

          const rawRole = await fetchProfileRoleWithRetry(result.user.id, meta)
          const role = normalizeUserRole(rawRole ?? meta)
          const redirectPath = getDefaultDashboard(role)

          console.log(
            '[CodeSpectra] Login role raw:',
            rawRole,
            'normalized:',
            role,
            '→',
            redirectPath
          )
          setTimeout(() => router.push(redirectPath), 500)
        } else {
          console.log('[CodeSpectra] No user returned from login')
          setTimeout(() => router.push(getDefaultDashboard('user')), 500)
        }
      } else {
        setError(result.error || 'Login failed. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = (provider: 'google' | 'github') => {
    window.location.href = `/api/auth/${provider}`
  }

  const fillDemoCredentials = (email: string, password: string) => {
    setEmail(email)
    setPassword(password)
    setError('')
    setAuthMethod('email')
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mfaFactorId || !mfaChallengeId) return
    setLoading(true)
    setError('')
    try {
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode.replace(/\s/g, ''),
      })
      if (vErr) {
        setError(vErr.message || 'Invalid code')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Session incomplete. Try signing in again.')
        return
      }
      const meta = (user.user_metadata as { role?: string } | undefined)?.role
      const rawRole = await fetchProfileRoleWithRetry(user.id, meta)
      const role = normalizeUserRole(rawRole ?? meta)
      setMfaStep(false)
      setMfaFactorId(null)
      setMfaChallengeId(null)
      setMfaCode('')
      router.push(getDefaultDashboard(role))
    } finally {
      setLoading(false)
    }
  }

  /** Already signed in — send to the right dashboard (session is valid until Supabase expires it). */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled || !session?.user) {
          if (!cancelled) setSessionChecked(true)
          return
        }
        const meta = (session.user.user_metadata as { role?: string } | undefined)?.role
        const rawRole = await fetchProfileRoleWithRetry(session.user.id, meta)
        const role = normalizeUserRole(rawRole ?? meta)
        router.replace(getDefaultDashboard(role))
      } catch {
        if (!cancelled) setSessionChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  // Load demo users from sessionStorage (set after setup)
  useEffect(() => {
    const stored = sessionStorage.getItem('demoUsers')
    if (stored) {
      try {
        const users = JSON.parse(stored)
        setDemoUsers(users)
      } catch (e) {
        console.log('[CodeSpectra] Could not parse stored demo users')
      }
    }
  }, [])

  if (!sessionChecked) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4 text-muted-foreground">
        <p className="text-sm">Checking your session…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold">CodeSpectra</span>
            </Link>
            <h1 className="text-3xl font-bold mb-2">{mfaStep ? 'Two-factor verification' : 'Welcome back'}</h1>
            <p className="text-muted-foreground">
              {mfaStep ? 'Enter the code from your authenticator app to finish signing in.' : 'Sign in to access your dashboard'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="wrap-break-word text-left leading-relaxed">{error}</p>
            </div>
          )}

          {mfaStep ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Authenticator code</label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="h-11"
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 gap-2">
                {loading ? 'Verifying…' : 'Verify and continue'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setMfaStep(false)
                  setMfaFactorId(null)
                  setMfaChallengeId(null)
                  setMfaCode('')
                  setError('')
                  void supabase.auth.signOut()
                }}
              >
                Cancel and sign out
              </Button>
            </form>
          ) : /* Auth Method Selection */
          authMethod === null ? (
            <div className="space-y-4">
              {/* Email Login Button */}
              <Button 
                onClick={() => setAuthMethod('email')} 
                className="w-full h-12 text-base gap-2"
              >
                <Mail className="w-5 h-5" />
                Continue with Email
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/40"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-background text-xs text-muted-foreground">or continue with</span>
                </div>
              </div>

              {/* OAuth Options */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => handleOAuthLogin('github')} 
                  variant="outline"
                  className="h-11 gap-2"
                >
                  <Github className="w-5 h-5" />
                  GitHub
                </Button>
                <Button 
                  onClick={() => handleOAuthLogin('google')} 
                  variant="outline"
                  className="h-11 gap-2"
                >
                  <Mail className="w-5 h-5" />
                  Google
                </Button>
              </div>

              {/* Face ID Button */}
              <Button 
                onClick={() => setAuthMethod('face')} 
                variant="outline" 
                className="w-full h-11 gap-2"
              >
                <Lock className="w-5 h-5" />
                Sign in with Face ID
              </Button>
            </div>
          ) : authMethod === 'face' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Account email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={faceEmail}
                  onChange={(e) => setFaceEmail(e.target.value)}
                  className="h-11"
                  autoComplete="username"
                />
                <p className="text-xs text-muted-foreground">
                  Face sign-in matches this account after you capture your face. Requires server configuration (see Settings → Security).
                </p>
              </div>
              <FaceRecognition onCapture={(d) => void handleFaceCapture(d)} mode="login" />
              <Button 
                variant="outline" 
                onClick={() => setAuthMethod(null)} 
                className="w-full h-11"
              >
                Back to options
              </Button>
            </>
          ) : (
            <>
              <form onSubmit={handleEmailLogin} className="space-y-5">
                {/* Email Field */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Password</label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="remember"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                    Remember me
                  </label>
                </div>

                {/* Sign In Button */}
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-11 text-base gap-2"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </Button>
              </form>

              {/* Back Button */}
              <Button 
                variant="ghost" 
                onClick={() => setAuthMethod(null)} 
                className="w-full text-muted-foreground"
              >
                Back to options
              </Button>
            </>
          )}

          {/* Demo Accounts Card */}
          {!mfaStep && authMethod === null && (
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary mb-2">Try Demo</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {demoUsers.length > 0 ? 'Click any account below to test it' : 'First time? Run setup to create demo users'}
                    </p>
                  </div>
                </div>
                {demoUsers.length === 0 && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    asChild
                    className="w-full"
                  >
                    <Link href="/setup">Run Setup</Link>
                  </Button>
                )}
              </div>

              {/* Demo Users Credentials - Show all 3 */}
              {demoUsers.length > 0 ? (
                <div className="bg-muted/50 border border-border/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Demo Accounts - Click to login:</p>
                  <div className="space-y-2">
                    {demoUsers.map((user, index) => (
                      <button
                        key={index}
                        onClick={() => fillDemoCredentials(user.email, user.password)}
                        className="w-full p-3 bg-background border border-border/40 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-semibold text-foreground capitalize">{user.full_name}</p>
                              <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded capitalize font-semibold">{user.role}</span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 border border-border/40 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Default Demo Credentials</p>
                  <div className="space-y-2">
                    <button
                      onClick={() => fillDemoCredentials('demo@codespectra.com', 'DemoPass123!')}
                      className="w-full p-3 bg-background border border-border/40 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground">Demo User</p>
                          <p className="text-xs text-muted-foreground font-mono">demo@codespectra.com</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-primary" />
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="text-primary font-medium hover:text-primary/80 transition-colors">
                Create one
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              By signing in, you agree to our{' '}
              <Link href="#" className="text-primary/60 hover:text-primary transition-colors">Terms</Link>
              {' '}and{' '}
              <Link href="#" className="text-primary/60 hover:text-primary transition-colors">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
