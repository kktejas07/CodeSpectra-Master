'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Code2, AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase-client'

async function establishRecoverySession(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'This page must be opened in a browser.' }
  }

  const search = new URLSearchParams(window.location.search)
  const code = search.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return { ok: false, message: error.message }
    window.history.replaceState(null, '', `${window.location.pathname}`)
    return { ok: true }
  }

  const hash = window.location.hash.replace(/^#/, '')
  if (hash) {
    const p = new URLSearchParams(hash)
    const access_token = p.get('access_token')
    const refresh_token = p.get('refresh_token')
    const type = p.get('type')
    if (access_token && refresh_token && type === 'recovery') {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) return { ok: false, message: error.message }
      window.history.replaceState(null, '', window.location.pathname)
      return { ok: true }
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) {
    return { ok: true }
  }

  return {
    ok: false,
    message:
      'Invalid or expired reset link. Request a new one from the sign-in page. If you just clicked the email link, confirm Redirect URLs in Supabase include this site.',
  }
}

function ResetPasswordForm() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const init = useCallback(async () => {
    setSessionError(null)
    const result = await establishRecoverySession()
    if (!result.ok) {
      setSessionError(result.message)
      setReady(true)
      return
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void init()
  }, [init])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password })
      if (upErr) {
        setError(upErr.message)
        return
      }
      setDone(true)
      setTimeout(() => router.push('/auth/login'), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Checking your reset link…</p>
      </div>
    )
  }

  if (sessionError) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Code2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">CodeSpectra</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Link problem</h1>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-relaxed">{sessionError}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="rounded-lg" asChild>
            <Link href="/auth/forgot-password">Request a new link</Link>
          </Button>
          <Button variant="outline" className="rounded-lg" asChild>
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">Redirecting you to sign in…</p>
        </div>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    )
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
        <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Use a strong password you have not used here before.</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="np" className="text-sm font-medium">
            New password
          </label>
          <div className="relative">
            <Input
              id="np"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="npc" className="text-sm font-medium">
            Confirm password
          </label>
          <Input
            id="npc"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="h-11"
          />
        </div>
        <Button type="submit" disabled={loading} className="h-11 w-full gap-2 text-base">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Update password
        </Button>
      </form>

      <Button variant="ghost" className="w-full text-muted-foreground" asChild>
        <Link href="/auth/login">Cancel and return to sign in</Link>
      </Button>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
