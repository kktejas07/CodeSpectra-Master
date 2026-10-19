'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Shield, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useConfirm } from '@/lib/confirm-context'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel } from '@/components/app/page-kit'

interface SSOProvider {
  id: string; name: string; provider_type: string; issuer: string
  client_id: string; metadata_url: string; domains: string[]
  default_role: string; enabled: boolean; created_at: string
  tenant_id?: string; org_id?: string
}

interface TenantOption { id: string; name: string }

const EMPTY_FORM = {
  name: '', provider_type: 'oidc', issuer: '', client_id: '',
  client_secret: '', metadata_url: '', domains: '', default_role: 'user',
  attribute_mapping: '{"email":"email"}', tenant_id: '',
}

export default function AdminSSOPage() {
  const gate = usePageGuard('superadmin')
  const confirmDialog = useConfirm()
  const addToast = useToast()
  const [providers, setProviders] = useState<SSOProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantsFailed, setTenantsFailed] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sso', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setProviders(j.providers || [])
      } else addToast({ type: 'error', title: "Couldn't load SSO providers", message: 'Refresh the page or try again in a moment.' })
    } catch { addToast({ type: 'error', title: "Couldn't load SSO providers", message: 'Refresh the page or try again in a moment.' }) } finally { setLoading(false) }
  }, [addToast])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  useEffect(() => {
    if (!gate.ready) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/tenants', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) throw new Error(String(res.status))
        const j = await res.json().catch(() => ({}))
        const list = (j.tenants || j.data || []) as Array<{ id?: unknown; name?: unknown }>
        if (!cancelled) {
          setTenants(
            list
              .filter((t) => typeof t.id === 'string' && t.id)
              .map((t) => ({ id: t.id as string, name: typeof t.name === 'string' && t.name ? t.name : (t.id as string) })),
          )
        }
      } catch {
        if (!cancelled) setTenantsFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [gate.ready])

  const tenantName = (id?: string) => {
    if (!id) return null
    return tenants.find((t) => t.id === id)?.name || id
  }

  const create = async () => {
    setBusy(true)
    setFormError(null)
    try {
      const res = await csrfFetch('/api/admin/sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // Organisation admins only make sense inside an organisation.
          default_role: form.tenant_id ? form.default_role : 'user',
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setForm(EMPTY_FORM)
        addToast({ type: 'success', title: 'Provider added', message: `${form.name || 'The provider'} is set up.` })
        await load()
      } else {
        const j = await res.json().catch(() => ({}))
        setFormError(typeof j.error === 'string' ? j.error : 'Could not create the provider. Try again.')
      }
    } catch {
      setFormError('Could not create the provider. Try again.')
    } finally { setBusy(false) }
  }

  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const setEnabled = async (p: SSOProvider, enabled: boolean) => {
    setRowBusy(p.id); setRowError(null)
    try {
      const res = await csrfFetch(`/api/admin/sso?id=${encodeURIComponent(p.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not update the provider.')
      setProviders((xs) => xs.map((x) => (x.id === p.id ? { ...x, enabled } : x)))
      addToast({ type: 'success', title: enabled ? 'Provider turned on' : 'Provider turned off', message: p.name })
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not update the provider.')
    } finally { setRowBusy(null) }
  }

  const remove = async (p: SSOProvider) => {
    if (!(await confirmDialog({ title: 'Delete this provider?', description: `Delete the ${p.name} provider? People who sign in with it will need another way in.`, confirmText: 'Delete', destructive: true }))) return
    setRowBusy(p.id); setRowError(null)
    try {
      const res = await csrfFetch(`/api/admin/sso?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not delete the provider.')
      setProviders((xs) => xs.filter((x) => x.id !== p.id))
      addToast({ type: 'success', title: 'Provider deleted', message: p.name })
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Could not delete the provider.')
    } finally { setRowBusy(null) }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="integrations"
        title="Single sign-on"
        description="Let organizations sign in through their own identity provider (SAML or OIDC)."
        icon={<Shield />}
        actions={
          <Button onClick={() => setShowForm(true)} disabled={showForm}>
            <Plus className="mr-1 h-4 w-4" /> Add provider
          </Button>
        }
      />

      <Panel className="border-primary/20 bg-primary/5 p-5">
        <p className="text-sm text-foreground">
          People whose email domain matches a provider are asked to sign in with SSO. Their account is created
          automatically the first time they sign in.
        </p>
      </Panel>

      {/* Add form */}
      {showForm && (
        <Panel className="space-y-4">
          <h2 className="font-semibold text-foreground">New SSO provider</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="sso-name">Provider name</Label>
              <Input id="sso-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Okta / Azure AD / Google Workspace" />
            </div>
            <div>
              <Label htmlFor="sso-type">Type</Label>
              <select id="sso-type" value={form.provider_type} onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="oidc">OIDC / Azure AD</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sso-issuer">Issuer URL</Label>
              <Input id="sso-issuer" value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} placeholder="https://accounts.google.com" />
            </div>
            <div>
              <Label htmlFor="sso-client-id">Client ID</Label>
              <Input id="sso-client-id" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sso-client-secret">Client secret</Label>
              <PasswordInput id="sso-client-secret" value={form.client_secret} onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sso-metadata">Metadata or discovery URL</Label>
              <Input id="sso-metadata" value={form.metadata_url} onChange={(e) => setForm((f) => ({ ...f, metadata_url: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sso-domains">Email domains (comma-separated)</Label>
              <Input id="sso-domains" value={form.domains} onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))} placeholder="company.com, myorg.org" />
            </div>
            <div>
              <Label htmlFor="sso-tenant">Organisation</Label>
              <select id="sso-tenant" value={form.tenant_id}
                onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value, default_role: e.target.value ? f.default_role : 'user' }))}
                aria-describedby="sso-tenant-hint"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">No organisation</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p id="sso-tenant-hint" className="mt-1 text-xs text-muted-foreground">
                People who sign in through this provider join this organisation. Leave empty to create regular accounts.
              </p>
              {tenantsFailed && (
                <p className="mt-1 text-xs text-destructive">Couldn&apos;t load organisations. Reload the page to try again.</p>
              )}
            </div>
            <div>
              <Label htmlFor="sso-role">Default role</Label>
              <select id="sso-role" value={form.default_role} onChange={(e) => setForm((f) => ({ ...f, default_role: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="user">User</option>
                <option value="tenant_admin" disabled={!form.tenant_id}>Organization admin</option>
              </select>
              {!form.tenant_id && (
                <p className="mt-1 text-xs text-muted-foreground">Pick an organisation to allow the organisation admin role.</p>
              )}
            </div>
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Create provider</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setFormError(null) }}>Cancel</Button>
          </div>
        </Panel>
      )}

      {rowError ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{rowError}</p>
      ) : null}
      {/* Provider list */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : providers.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-muted-foreground">
          No SSO providers yet. Use <span className="font-medium text-foreground">Add provider</span> to connect Okta, Azure AD or Google Workspace.
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Panel key={p.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{p.provider_type?.toUpperCase()} · {p.issuer}</p>
                </div>
                <Badge variant={p.enabled ? 'default' : 'secondary'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.domains?.map((d) => (
                  <Badge key={d} variant="outline" className="text-[10px]">@{d}</Badge>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Client: <span className="font-mono">{p.client_id?.slice(0, 16)}…</span></span>
                <span>Role: {p.default_role}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Organisation:{' '}
                <span className="font-medium text-foreground">
                  {tenantName(p.tenant_id || p.org_id) || 'None (regular accounts)'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" disabled={rowBusy === p.id} onClick={() => void setEnabled(p, !p.enabled)}>
                  {rowBusy === p.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : null}
                  {p.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button size="sm" variant="ghost" disabled={rowBusy === p.id} onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="mr-1 h-3 w-3 text-destructive" aria-hidden /> Delete
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
