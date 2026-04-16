'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Code2, AlertCircle, CheckCircle, Github, Mail, Lock } from 'lucide-react'
import { FaceRecognition } from '@/components/auth/face-recognition'
import { useToast } from '@/lib/toast-context'
import { signIn } from '@/lib/auth-service'

export default function Login() {
  const router = useRouter()
  const toast = useToast()
  const [authMethod, setAuthMethod] = useState<'face' | 'email' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFaceCapture = async (faceData: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/face-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceData }),
      })

      if (response.ok) {
        toast({
          type: 'success',
          title: 'Face Recognition Successful',
          message: 'Welcome back to CodeSpectra!',
        })
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        toast({
          type: 'error',
          title: 'Authentication Failed',
          message: 'Face not recognized. Please try again.',
        })
      }
    } catch (err) {
      toast({
        type: 'error',
        title: 'Error',
        message: 'An error occurred during face recognition.',
      })
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
        toast({
          type: 'success',
          title: 'Login Successful',
          message: 'Redirecting to dashboard...',
        })
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        setError(result.error || 'Login failed. Please try again.')
        toast({
          type: 'error',
          title: 'Login Failed',
          message: result.error,
        })
      }
    } catch (err) {
      setError('An unexpected error occurred.')
      toast({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = (provider: 'google' | 'github') => {
    window.location.href = `/api/auth/${provider}`
  }

  const fillDemoCredentials = (role: 'superadmin' | 'admin' | 'user') => {
    const demos = {
      superadmin: { email: 'demo.superadmin@codespectra.com', password: 'DemoPass123!' },
      admin: { email: 'demo.admin@codespectra.com', password: 'DemoPass123!' },
      user: { email: 'demo.user@codespectra.com', password: 'DemoPass123!' },
    }
    setEmail(demos[role].email)
    setPassword(demos[role].password)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              CodeSpectra
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome Back</h1>
          <p className="text-foreground/60">Secure, intelligent code analysis platform</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Auth Method Selection */}
        {authMethod === null ? (
          <div className="space-y-4">
            <Button onClick={() => setAuthMethod('face')} className="w-full h-12" size="lg">
              🔐 Face Recognition Login
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card text-foreground/60">Or continue with</span>
              </div>
            </div>

            <div className="space-y-3">
              <Button onClick={() => setAuthMethod('email')} variant="outline" className="w-full">
                <Mail className="w-4 h-4 mr-2" />
                Email & Password
              </Button>
              <Button onClick={() => handleOAuthLogin('google')} variant="outline" className="w-full">
                <Mail className="w-4 h-4 mr-2" />
                Google
              </Button>
              <Button onClick={() => handleOAuthLogin('github')} variant="outline" className="w-full">
                <Github className="w-4 h-4 mr-2" />
                GitHub
              </Button>
            </div>
          </div>
        ) : authMethod === 'face' ? (
          <>
            <FaceRecognition onCapture={handleFaceCapture} mode="login" />
            <Button variant="outline" onClick={() => setAuthMethod(null)} className="w-full">
              Back
            </Button>
          </>
        ) : (
          <>
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Password</label>
                  <Link href="#" className="text-xs text-primary hover:underline">
                    Forgot?
                  </Link>
                </div>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background border-border"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
            <Button variant="outline" onClick={() => setAuthMethod(null)} className="w-full">
              Back
            </Button>
          </>
        )}

        {/* Demo Accounts */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold text-foreground/60">🧪 DEMO ACCOUNTS</p>
          <div className="space-y-2">
            {[
              { role: 'superadmin' as const, label: 'Superadmin', icon: '👑' },
              { role: 'admin' as const, label: 'Tenant Admin', icon: '📊' },
              { role: 'user' as const, label: 'User', icon: '👤' },
            ].map((demo) => (
              <Button
                key={demo.role}
                variant="ghost"
                size="sm"
                onClick={() => fillDemoCredentials(demo.role)}
                className="w-full justify-start text-xs"
              >
                <span className="mr-2">{demo.icon}</span>
                <span className="flex-1 text-left">{demo.label}</span>
                <Badge variant="secondary" className="text-xs">Fill</Badge>
              </Button>
            ))}
          </div>
          <p className="text-xs text-foreground/50">Password: DemoPass123!</p>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-4 text-center space-y-3">
          <p className="text-sm text-foreground/60">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
          <p className="text-xs text-foreground/50">
            By signing in, you agree to our Terms and Privacy Policy
          </p>
        </div>
      </Card>
    </div>
  )
}
