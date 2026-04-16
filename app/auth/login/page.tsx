'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, CheckCircle } from 'lucide-react'
import { signIn } from '@/lib/auth-service'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate inputs
    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      console.log('[v0] Attempting login with email:', email)
      const result = await signIn(email, password)
      console.log('[v0] Login result:', result)
      
      if (result.success) {
        setSuccess('Login successful! Redirecting to dashboard...')
        // Redirect to dashboard after 1.5 seconds
        setTimeout(() => {
          router.push('/dashboard')
        }, 1500)
      } else {
        console.error('[v0] Login error:', result.error)
        
        // Provide more specific error messages
        let errorMsg = result.error || 'Login failed. Please try again.'
        
        if (errorMsg.toLowerCase().includes('invalid')) {
          errorMsg = 'Invalid email or password. Please check your credentials.'
        } else if (errorMsg.toLowerCase().includes('not confirmed')) {
          errorMsg = 'Please confirm your email address before logging in.'
        } else if (errorMsg.toLowerCase().includes('user')) {
          errorMsg = 'User not found. Have you created a demo user? Visit the setup page.'
        }
        
        setError(errorMsg)
      }
    } catch (err) {
      console.error('[v0] Login exception:', err)
      setError('An unexpected error occurred. Please ensure your Supabase is configured correctly.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemoCredentials = () => {
    setEmail('demo@codespectra.com')
    setPassword('DemoPass123!')
    setError('')
    setSuccess('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Code2 className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">CodeSpectra</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Welcome Back</h1>
        <p className="text-foreground/60">Sign in to continue your coding journey</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Login Failed</p>
            <p className="text-sm text-destructive/80">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="bg-green-500/10 border border-green-500 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Success!</p>
            <p className="text-sm text-green-600">{success}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-background border-border text-foreground placeholder:text-foreground/50"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Password</label>
            <Link href="#" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-background border-border text-foreground placeholder:text-foreground/50"
          />
        </div>

        <Button 
          type="submit" 
          disabled={loading}
          className="w-full"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      {/* Demo Credentials */}
      <div className="bg-card/50 border border-border rounded-lg p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">🧪 Demo Account</p>
          <p className="text-xs text-foreground/60">Use these credentials to test the platform:</p>
        </div>
        <div className="space-y-2 bg-background/50 rounded p-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="text-foreground/70">Email:</span>
            <span className="text-primary font-semibold">demo@codespectra.com</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground/70">Password:</span>
            <span className="text-primary font-semibold">DemoPass123!</span>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full text-sm"
          onClick={fillDemoCredentials}
        >
          Auto-fill Demo Credentials
        </Button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-background text-foreground/50">Or</span>
        </div>
      </div>

      {/* OAuth Options - Placeholder */}
      <Button variant="outline" className="w-full">
        Continue with Google
      </Button>

      {/* Sign Up Link */}
      <div className="text-center text-sm text-foreground/60">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </div>

      {/* Terms */}
      <p className="text-center text-xs text-foreground/50">
        By signing in, you agree to our{' '}
        <Link href="#" className="hover:text-foreground/70">Terms of Service</Link>
        {' '}and{' '}
        <Link href="#" className="hover:text-foreground/70">Privacy Policy</Link>
      </p>
    </div>
  )
}
