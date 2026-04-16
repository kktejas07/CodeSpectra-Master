'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, Github, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
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
            <div className="bg-muted/50 border border-border/40 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Demo Accounts</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { email: 'demo.superadmin@codespectra.com', label: 'Superadmin' },
                  { email: 'demo.admin@codespectra.com', label: 'Admin' },
                  { email: 'demo.user@codespectra.com', label: 'User' },
                ].map((demo) => (
                  <button
                    key={demo.email}
                    onClick={() => fillDemoCredentials(demo.email, 'DemoPass123!')}
                    className="text-xs px-3 py-2 rounded-lg bg-background hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors font-medium border border-border/40"
                  >
                    {demo.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Password: <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono">DemoPass123!</code>
              </p>
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
