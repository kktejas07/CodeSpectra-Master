'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, ArrowLeft, Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${origin}/auth/reset-password`,
      })
      if (resetErr) {
        setError(resetErr.message)
        return
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Code2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold">CodeSpectra</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ll email you a secure link to choose a new password. The link expires after a short time.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-left leading-relaxed">{error}</p>
        </div>
      )}

      {sent ? (
        <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-6 text-center">
          <p className="text-sm text-foreground">
            If an account exists for <span className="font-mono font-medium">{email.trim()}</span>, you will receive
            reset instructions shortly.
          </p>
          <p className="text-xs text-muted-foreground">
            Check spam folders. Add <code className="rounded bg-muted px-1">/auth/reset-password</code> to Supabase →
            Authentication → URL configuration → Redirect URLs if the link does not open.
          </p>
          <Button variant="outline" className="w-full rounded-lg" asChild>
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="fp-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11"
            />
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full gap-2 text-base">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send reset link
          </Button>
        </form>
      )}

      <Button variant="ghost" className="w-full text-muted-foreground" asChild>
        <Link href="/auth/login" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </Button>
    </div>
  )
}
