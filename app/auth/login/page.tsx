'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2 } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // TODO: Implement Supabase login
    setTimeout(() => setLoading(false), 1000)
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
