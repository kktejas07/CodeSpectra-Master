'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, CheckCircle, Github, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { signIn } from '@/lib/auth-service'

export default function Login() {
  const router = useRouter()
  const [authMethod, setAuthMethod] = useState<'face' | 'email' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const handleFaceCapture = async (faceData: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceData }),
      })

      if (response.ok) {
        setTimeout(() => router.push('/dashboard'), 1000)
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
        setTimeout(() => router.push('/dashboard'), 1000)
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
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg">
                <Code2 className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">CodeSpectra</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-2">Sign in to access your code analysis dashboard</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Auth Method Selection */}
          {authMethod === null ? (
            <div className="space-y-4">
              {/* Email Login Button */}
              <Button 
                onClick={() => setAuthMethod('email')} 
                className="w-full h-12 text-base font-medium rounded-lg transition-all duration-200 hover:shadow-md"
                size="lg"
              >
                Continue with Email
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/40"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 bg-background text-xs text-muted-foreground font-medium">OR</span>
                </div>
              </div>

              {/* OAuth Options */}
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={() => handleOAuthLogin('github')} 
                  variant="outline"
                  className="h-11 rounded-lg transition-all duration-200 hover:bg-muted border-border/50 hover:border-border"
                >
                  <Github className="w-5 h-5 mr-2" />
                  <span className="hidden sm:inline">GitHub</span>
                </Button>
                <Button 
                  onClick={() => handleOAuthLogin('google')} 
                  variant="outline"
                  className="h-11 rounded-lg transition-all duration-200 hover:bg-muted border-border/50 hover:border-border"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  <span className="hidden sm:inline">Google</span>
                </Button>
              </div>

              {/* Face ID Button */}
              <Button 
                onClick={() => setAuthMethod('face')} 
                variant="outline" 
                className="w-full h-11 rounded-lg transition-all duration-200 border-border/50 hover:border-border hover:bg-muted"
              >
                <Lock className="w-5 h-5 mr-2" />
                Sign in with Face ID
              </Button>
            </div>
          ) : authMethod === 'face' ? (
            <>
              <FaceRecognition onCapture={handleFaceCapture} mode="login" />
              <Button 
                variant="outline" 
                onClick={() => setAuthMethod(null)} 
                className="w-full h-11 rounded-lg"
              >
                Back
              </Button>
            </>
          ) : (
            <>
              <form onSubmit={handleEmailLogin} className="space-y-5">
                {/* Email Field */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground block">Email</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 rounded-lg bg-card border-border/50 placeholder:text-muted-foreground/50 transition-all duration-200 focus:border-primary/50 focus:ring-primary/10"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-foreground">Password</label>
                    <Link href="#" className="text-xs text-primary font-medium hover:text-primary/80 transition-colors">
                      Forgot?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 rounded-lg bg-card border-border/50 placeholder:text-muted-foreground/50 pr-10 transition-all duration-200 focus:border-primary/50 focus:ring-primary/10"
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
                    className="w-4 h-4 rounded border-border/50 accent-primary"
                  />
                  <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    Remember me
                  </label>
                </div>

                {/* Sign In Button */}
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-11 text-base font-medium rounded-lg transition-all duration-200 hover:shadow-md"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </form>

              {/* Back Button */}
              <Button 
                variant="ghost" 
                onClick={() => setAuthMethod(null)} 
                className="w-full text-muted-foreground hover:text-foreground"
              >
                ← Back
              </Button>
            </>
          )}

          {/* Demo Accounts Card */}
          {authMethod === null && (
            <div className="bg-card border border-border/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  ?
                </div>
                <p className="text-xs font-semibold text-foreground">Demo Accounts</p>
              </div>
              <div className="space-y-2">
                {[
                  { email: 'demo.superadmin@codespectra.com', label: '👑 Superadmin' },
                  { email: 'demo.admin@codespectra.com', label: '📊 Tenant Admin' },
                  { email: 'demo.user@codespectra.com', label: '👤 User' },
                ].map((demo) => (
                  <button
                    key={demo.email}
                    onClick={() => fillDemoCredentials(demo.email, 'DemoPass123!')}
                    className="w-full text-xs px-3 py-2 rounded-lg text-left bg-background/50 hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-all duration-200 font-medium"
                  >
                    {demo.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Password: <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono">DemoPass123!</code></p>
            </div>
          )}

          {/* Footer */}
          <div className="space-y-4 border-t border-border/30 pt-6">
            <p className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="text-primary font-semibold hover:text-primary/80 transition-colors">
                Create one
              </Link>
            </p>
            <p className="text-xs text-center text-muted-foreground">
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

