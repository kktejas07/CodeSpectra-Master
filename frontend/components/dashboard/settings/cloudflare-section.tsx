'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Globe2, Eye, EyeOff } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { presetFor, type S3Provider } from '@/lib/s3-presets'

export function CloudflareSettingsSection() {
  const [zoneId, setZoneId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [savedZoneId, setSavedZoneId] = useState('')
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
        setSavedZoneId(sec.cloudflare_zone_id || '')
        setHasSavedToken(!!sec.has_cloudflare_api_token)
        setZoneId(sec.cloudflare_zone_id || '')
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
      const res = await fetch('/api/admin/server-secrets/reveal?key=cloudflare_api_token', { credentials: 'include' })
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
      if (zoneId.trim()) body.cloudflare_zone_id = zoneId.trim()
      if (apiToken.trim()) body.cloudflare_api_token = apiToken.trim()
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')
      setApiToken('')
      if (json.secrets) {
        setSavedZoneId(json.secrets.cloudflare_zone_id || '')
        setHasSavedToken(!!json.secrets.has_cloudflare_api_token)
      }
      setMessage({ type: 'success', text: 'Cloudflare settings saved. Cache purge is now available.' })
      loadSettings()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [zoneId, apiToken, loadSettings])

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
            <Globe2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cloudflare</h2>
            <p className="text-sm text-muted-foreground">CDN cache purge &amp; analytics integration</p>
          </div>
        </div>
        {savedZoneId && hasSavedToken ? (
          <span className="rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2.5 py-0.5 text-xs font-medium">
            ✓ Active
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">
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
          <Label htmlFor="cf_zone_id">Zone ID</Label>
          <input
            id="cf_zone_id"
            type="text"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Cloudflare Zone ID"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cf_api_token">API Token</Label>
          <div className="relative">
            <input
              id="cf_api_token"
              type={showToken ? 'text' : 'password'}
              value={showToken ? revealedToken : '••••••••'}
              onChange={(e) => setApiToken(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={hasSavedToken ? 'Token saved — enter new value to replace' : 'cf-api-token-...'}
            />
            <button
              type="button"
              onClick={handleRevealToggle}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Token needs <code className="rounded bg-muted px-1">cache:purge</code> and <code className="rounded bg-muted px-1">zone:read</code> permissions.
          </p>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </Card>

      <ObjectStorageCard />

      <Card className="space-y-3 border-dashed border-muted-foreground/30 p-6">
        <h3 className="text-sm font-semibold">How to get your credentials</h3>
        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>1. Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cloudflare Dashboard</a></li>
          <li>2. Copy <strong>Zone ID</strong> from the Overview page (right sidebar)</li>
          <li>3. Create an API token: My Profile → API Tokens → Create Custom Token</li>
          <li>4. Add permissions: <strong>Zone → Cache → Purge</strong> and <strong>Zone → Zone → Read</strong></li>
          <li>5. Scope to your domain, create, and paste the token above</li>
        </ol>
      </Card>
    </div>
  )
}

function ObjectStorageCard() {
  const [provider, setProvider] = useState<S3Provider>('r2')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('auto')
  const [accountId, setAccountId] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [bucket, setBucket] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showSecret, setShowSecret] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRevealToggle = useCallback(async () => {
    if (showSecret) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setShowSecret(false)
      setRevealedSecret('')
    } else {
      const key = provider === 'r2' ? 'r2_secret_access_key' : 's3_secret_access_key'
      const res = await fetch(`/api/admin/server-secrets/reveal?key=${key}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.value) setRevealedSecret(json.value)
      setShowSecret(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setShowSecret(false)
        setRevealedSecret('')
      }, 30_000)
    }
  }, [showSecret, provider])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const load = useCallback(() => {
    fetch('/api/admin/server-secrets', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const sec = d.secrets || d
        const p = (sec.s3_provider || (sec.r2_account_id ? 'r2' : 'r2')) as S3Provider
        setProvider(p)
        setEndpoint(sec.s3_endpoint || '')
        setRegion(sec.s3_region || (p === 'r2' || p === 'gcs' ? 'auto' : 'us-east-1'))
        setAccountId(sec.r2_account_id || '')
        setAccessKeyId(sec.s3_access_key_id || sec.r2_access_key_id || '')
        setBucket(sec.s3_bucket || sec.r2_bucket || '')
        setHasSecret(!!sec.has_s3_secret_access_key || !!sec.has_r2_secret_access_key)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const applyPreset = (p: S3Provider) => {
    setProvider(p)
    const preset = presetFor(p, accountId)
    if (p !== 'custom' && p !== 'r2') {
      setEndpoint(preset.endpoint)
      setRegion(preset.region)
    }
    if (p === 'r2') {
      setRegion('auto')
      if (accountId) setEndpoint(presetFor('r2', accountId).endpoint)
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const ep = provider === 'r2' && accountId.trim()
        ? presetFor('r2', accountId.trim()).endpoint
        : endpoint.trim()
      const body: Record<string, string> = {
        s3_provider: provider,
        s3_endpoint: ep,
        s3_region: region.trim() || 'us-east-1',
        s3_bucket: bucket.trim(),
        s3_access_key_id: accessKeyId.trim(),
        r2_account_id: accountId.trim(),
        r2_bucket: bucket.trim(),
        r2_access_key_id: accessKeyId.trim(),
      }
      if (secretKey.trim()) {
        body.s3_secret_access_key = secretKey.trim()
        body.r2_secret_access_key = secretKey.trim()
      }
      const res = await csrfFetch('/api/admin/server-secrets', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Save failed')
      setSecretKey('')
      setHasSecret(true)
      setEndpoint(ep)
      setMessage({ type: 'success', text: 'Storage saved. Test the connection, then regenerate a course — files upload to this bucket automatically.' })
      load()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const res = await csrfFetch('/api/admin/r2/test', { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json.error as string) || 'Test failed')
      setMessage({ type: 'success', text: json.message || 'Connected' })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const ready = Boolean((provider !== 'r2' ? endpoint : accountId) && accessKeyId && bucket && hasSecret)

  return (
    <Card className="space-y-5 border-border/60 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Course media storage</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Any S3-compatible bucket: Cloudflare R2, AWS S3, Google Cloud, Hetzner, or MinIO on a VPS.
            Switch providers later without changing course code — only these credentials.
          </p>
        </div>
        {ready ? (
          <span className="shrink-0 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 px-2.5 py-0.5 text-xs font-medium">✓ Ready</span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-xs font-medium">Not configured</span>
        )}
      </div>
      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.type === 'success' ? 'border-green-500/20 bg-green-500/5 text-green-600' : 'border-red-500/20 bg-red-500/5 text-red-500'}`}>
          {message.text}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="s3_provider">Provider</Label>
          <select
            id="s3_provider"
            value={provider}
            onChange={(e) => applyPreset(e.target.value as S3Provider)}
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm"
          >
            <option value="r2">Cloudflare R2 (recommended — $0 egress)</option>
            <option value="s3">Amazon S3</option>
            <option value="gcs">Google Cloud Storage (HMAC / S3 interop)</option>
            <option value="hetzner">Hetzner Object Storage</option>
            <option value="custom">Custom / MinIO (Hetzner VPS, etc.)</option>
          </select>
        </div>
        {provider === 'r2' ? (
          <div className="space-y-1.5">
            <Label htmlFor="r2_account_id">R2 Account ID</Label>
            <input id="r2_account_id" value={accountId} onChange={(e) => {
              setAccountId(e.target.value)
              setEndpoint(presetFor('r2', e.target.value).endpoint)
            }} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm" placeholder="Cloudflare account ID" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="s3_endpoint">Endpoint</Label>
            <input id="s3_endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm" placeholder="https://s3.example.com" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="s3_region">Region</Label>
          <input id="s3_region" value={region} onChange={(e) => setRegion(e.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm" placeholder="auto" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s3_bucket">Bucket</Label>
          <input id="s3_bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm" placeholder="codespectra-courses" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s3_access_key_id">Access Key ID</Label>
          <input id="s3_access_key_id" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm" placeholder="Access key" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="s3_secret">Secret access key</Label>
          <div className="relative">
            <input
              id="s3_secret"
              type={showSecret ? 'text' : 'password'}
              value={showSecret ? revealedSecret : secretKey}
              onChange={(e) => {
                if (showSecret) setRevealedSecret(e.target.value)
                setSecretKey(e.target.value)
              }}
              className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={hasSecret ? 'Saved — enter a new key to replace' : 'Secret key'}
            />
            <button
              type="button"
              onClick={handleRevealToggle}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {provider === 'r2' && 'R2 → Create a private bucket, then R2 API token with Object Read & Write. Paste Account ID + keys here, Save, Test connection.'}
        {provider === 's3' && 'IAM user with s3:PutObject/GetObject/DeleteObject on the bucket. Endpoint must match the region.'}
        {provider === 'gcs' && 'GCS Settings → Interoperability → HMAC key. Endpoint stays storage.googleapis.com.'}
        {provider === 'hetzner' && 'Hetzner Cloud → Object Storage → copy the S3 endpoint for your location (fsn1, nbg1, hel1).'}
        {provider === 'custom' && 'Point at MinIO or any S3 API (including a reverse-proxied volume on a Hetzner VPS).'}
      </p>
      {provider === 'r2' && (
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal pl-4">
          <li>Cloudflare Dashboard → R2 → Create bucket (keep it private).</li>
          <li>R2 → Manage R2 API Tokens → Create API token (Object Read & Write, that bucket).</li>
          <li>Copy Account ID (R2 overview), Access Key ID, and Secret Access Key into the fields above. Region stays <code>auto</code>.</li>
          <li>Save storage → Test connection. New course videos upload automatically; regenerate old courses to move them off Mongo.</li>
        </ol>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={test} disabled={testing || !ready} className="gap-2">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Test connection
        </Button>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save storage
        </Button>
      </div>
    </Card>
  )
}
