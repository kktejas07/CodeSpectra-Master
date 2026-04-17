'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, Github, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { signIn } from '@/lib/auth-service'
import { createClient } from '@supabase/supabase-js'
import { getDefaultDashboard } from '@/lib/rbac'

export default function Login() {
  const router = useRouter()
  const [authMethod, setAuthMethod] = useState<'face' | 'email' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [demoUsers, setDemoUsers] = useState<any[]>([])

  const handleFaceCapture = async (faceData: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceData }),
      })

      if (response.ok) {
        const data = await response.json()
        
        // Fetch user profile to get role
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        
        if (supabaseUrl && supabaseKey && data.userId) {
          const supabase = createClient(supabaseUrl, supabaseKey)
          
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.userId)
            .single()

          console.log('[v0] Face login profile:', { profile, error: profileError })

          // Redirect based on role
          let redirectPath = '/dashboard'
          if (profile?.role === 'superadmin') {
            redirectPath = '/dashboard/admin/system'
          } else if (profile?.role === 'admin') {
            redirectPath = '/dashboard/admin/team'
          } else if (profile?.role === 'user') {
            redirectPath = '/dashboard'
          }

          console.log('[v0] Face login - User role:', profile?.role, 'Redirecting to:', redirectPath)
          setTimeout(() => router.push(redirectPath), 500)
        } else {
          console.log('[v0] Face login - Missing Supabase config')
          setTimeout(() => router.push('/dashboard'), 500)
        }
      } else {
        setError('Face not recognized. Please try again.')
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
        // Fetch user profile to get role
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        
        if (supabaseUrl && supabaseKey && result.user) {
          const supabase = createClient(supabaseUrl, supabaseKey)
          
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', result.user.id)
            .single()

          console.log('[v0] Profile fetch result:', { profile, error: profileError })

          // Redirect based on role
          let redirectPath = '/dashboard'
          if (profile?.role === 'superadmin') {
            redirectPath = '/dashboard/admin/system'
          } else if (profile?.role === 'admin') {
            redirectPath = '/dashboard/admin/team'
          } else if (profile?.role === 'user') {
            redirectPath = '/dashboard'
          }

          console.log('[v0] User role:', profile?.role, 'Redirecting to:', redirectPath)
          setTimeout(() => router.push(redirectPath), 500)
        } else {
          console.log('[v0] Missing Supabase config or user')
          setTimeout(() => router.push('/dashboard'), 500)
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

  // Load demo users from sessionStorage (set after setup)
  useEffect(() => {
    const stored = sessionStorage.getItem('demoUsers')
    if (stored) {
      try {
        const users = JSON.parse(stored)
        setDemoUsers(users)
      } catch (e) {
        console.log('[v0] Could not parse stored demo users')
      }
    }
  }, [])

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
            <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to access your dashboard</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Auth Method Selection */}
          {authMethod === null ? (
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
              <FaceRecognition onCapture={handleFaceCapture} mode="login" />
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
                    <Link href="#" className="text-xs text-primary hover:text-primary/80 transition-colors">
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
          {authMethod === null && (
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
                          <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
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
