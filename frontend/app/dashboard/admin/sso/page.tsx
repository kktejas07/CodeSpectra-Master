'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Shield, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'

interface SSOProvider {
  id: string; name: string; provider_type: string; issuer: string
  client_id: string; metadata_url: string; domains: string[]
  default_role: string; enabled: boolean; created_at: string
}

export default function AdminSSOPage() {
  const gate = usePageGuard('superadmin')
  const [providers, setProviders] = useState<SSOProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '', provider_type: 'oidc', issuer: '', client_id: '',
    client_secret: '', metadata_url: '', domains: '', default_role: 'user',
    attribute_mapping: '{"email":"email"}',
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sso', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json()
        setProviders(j.providers || [])
      }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { if (gate.ready) void load() }, [gate.ready, load])

  const create = async () => {
    setBusy(true)
    try {
      const res = await csrfFetch('/api/admin/sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowForm(false)
        setForm({ name: '', provider_type: 'oidc', issuer: '', client_id: '', client_secret: '', metadata_url: '', domains: '', default_role: 'user', attribute_mapping: '{"email":"email"}' })
        await load()
      }
    } catch {} finally { setBusy(false) }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" /> SSO / Enterprise Auth
        </h1>
        <Button onClick={() => setShowForm(true)} disabled={showForm}>
          <Plus className="mr-1 h-4 w-4" /> Add Provider
        </Button>
      </div>

      <Card className="p-5 bg-primary/5 border-primary/20">
        <p className="text-sm">
          Configure SAML or OIDC providers for Single Sign-On. Users with email domains matching
          a provider will be prompted to sign in via SSO. SSO users are auto-provisioned on first login.
        </p>
      </Card>

      {/* Add form */}
      {showForm && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">New SSO Provider</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Provider Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Okta / Azure AD / Google Workspace" />
            </div>
            <div>
              <Label>Type</Label>
              <select value={form.provider_type} onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value }))}
                className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm">
                <option value="oidc">OIDC / Azure AD</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </div>
            <div>
              <Label>Issuer URL</Label>
              <Input value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} placeholder="https://accounts.google.com" />
            </div>
            <div>
              <Label>Client ID</Label>
              <Input value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input type="password" value={form.client_secret} onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))} />
            </div>
            <div>
              <Label>Metadata / Discovery URL</Label>
              <Input value={form.metadata_url} onChange={(e) => setForm((f) => ({ ...f, metadata_url: e.target.value }))} />
            </div>
            <div>
              <Label>Domains (comma-separated)</Label>
              <Input value={form.domains} onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))} placeholder="company.com, myorg.org" />
            </div>
            <div>
              <Label>Default Role</Label>
              <select value={form.default_role} onChange={(e) => setForm((f) => ({ ...f, default_role: e.target.value }))}
                className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm">
                <option value="user">User</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Create Provider</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Provider list */}
      {loading ? (
        <Card className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading providers…
        </Card>
      ) : providers.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No SSO providers configured. Add one above.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
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
                <span>Client: {p.client_id?.slice(0, 16)}…</span>
                <span>Role: {p.default_role}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
