'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Database, Eye, EyeOff } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

export function RedisSettingsSection() {
  const [upstashUrl, setUpstashUrl] = useState('')
  const [upstashToken, setUpstashToken] = useState('')
  const [savedUpstashUrl, setSavedUpstashUrl] = useState('')
  const [hasSavedToken, setHasSavedToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showToken, setShowToken] = useState(false)
  const [revealedToken, setRevealedToken] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadSettings = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const sec = d.secrets || d
        setSavedUpstashUrl(sec.upstash_redis_rest_url || '')
        setHasSavedToken(!!sec.has_upstash_redis_rest_token)
        setUpstashUrl(sec.upstash_redis_rest_url || '')
      })
      .catch(() => { setMessage({ type: 'error', text: 'Failed to load settings' }) })
      .finally(() => setLoading(false))
  }, [])

  const handleRevealToggle = useCallback(async () => {
    if (showToken) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setShowToken(false)
      setRevealedToken('')
    } else {
      const res = await fetch(`/api/admin/server-secrets/reveal?key=upstash_redis_rest_token`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) setRevealedToken(json.value)
      setShowToken(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setShowToken(false)
        setRevealedToken('')
      }, 30_000)
    }
  }, [showToken])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const save = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const body: Record<string, string> = {}
      if (upstashUrl.trim()) body.upstash_redis_rest_url = upstashUrl.trim()
      if (upstashToken.trim()) body.upstash_redis_rest_token = upstashToken.trim()
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')
      setUpstashToken('')
      if (json.secrets) {
        setSavedUpstashUrl(json.secrets.upstash_redis_rest_url || '')
        setHasSavedToken(!!json.secrets.has_upstash_redis_rest_token)
      }
      setMessage({ type: 'success', text: 'Upstash Redis settings saved. Rate limiting is now configured.' })
      loadSettings()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [upstashUrl, upstashToken, loadSettings])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  if (loading) {
    return <div className="flex min-h-[20vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Upstash Redis</h2>
            <p className="text-sm text-muted-foreground">Distributed rate limiting for AI endpoints and API routes</p>
          </div>
        </div>
        {savedUpstashUrl && hasSavedToken ? (
          <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 text-[10px] uppercase tracking-wide font-medium">
            � ✓ Active
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 text-amber-300 px-2.5 py-0.5 text-[10px] uppercase tracking-wide font-medium">
            Not configured
          </span>
        )}
      </div>

      {message && (
        <div className={`rounded-lg border p-4 text-sm ${message.type === 'success' ? 'border-green-500/20 bg-green-500/5 text-green-600' : 'border-red-500/20 bg-red-500/5 text-red-500'}`}>
          {message.text}
        </div>
      )}

      <Card className="space-y-5 border-border/60 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="redis_url">Upstash Redis REST URL</Label>
          <input
            id="redis_url"
            type="text"
            value={upstashUrl}
            onChange={(e) => setUpstashUrl(e.target.value)}
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="https://us1-xxxx.upstash.io"
          />
          {savedUpstashUrl && (
            <p className="mt-2 text-xs text-muted-foreground">
              Current: {String(savedUpstashUrl)}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="redis_token">Upstash Redis REST Token</Label>
          <div className="relative">
            <input
              id="redis_token"
              type={showToken ? 'text' : 'password'}
              value={showToken ? revealedToken : '••••••••'}
              onChange={(e) => setUpstashToken(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={hasSavedToken ? 'Token saved — enter new value to replace' : 'sk-us1-xxxx...'}
            />
            <button
              type="button"
              onClick={handleRevealToggle}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {hasSavedToken && (
            <p className="mt-2 text-xs text-muted-foreground">
              Current token: {String(revealedToken || '••••••••')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Get your Upstash Redis REST URL and token from <a href="https://upstash.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Upstash Console</a>
          </p>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>
    </div>
  )
}