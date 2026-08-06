'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Building2, Users, Plus, Loader2, Trash2, Search, HelpCircle, Pencil, Eye, LogIn, ShieldAlert, RefreshCw, UserRound } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getRoleLabel, normalizeUserRole } from '@/lib/rbac'

interface Tenant {
  id: string
  name: string
  slug?: string
  plan?: string
  is_active: boolean
  created_at: string
  created_by?: string
  member_count: number
}

interface TenantMember {
  id: string
  name: string
  email: string
  role: string
  joinedAt?: string
  status: string
}

export default function TenantsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('enterprise')

  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editPlan, setEditPlan] = useState('enterprise')
  const [editActive, setEditActive] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)

  const [membersOf, setMembersOf] = useState<Tenant | null>(null)
  const [members, setMembers] = useState<TenantMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchTenants = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tenants', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setTenants(json.data || [])
      else addToast({ type: 'error', title: 'Failed', message: json.error })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load organizations' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchTenants() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(t =>
      t.name.toLowerCase().includes(q) || (t.slug || '').toLowerCase().includes(q)
    )
  }, [tenants, search])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await csrfFetch('/api/admin/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), plan }),
      })
      const json = await res.json()
      if (res.ok) {
        addToast({ type: 'success', title: 'Created', message: `Organization "${name.trim()}" created` })
        setName(''); setSlug(''); setPlan('enterprise')
        setCreateOpen(false)
        await fetchTenants()
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to create organization' })
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (t: Tenant) => {
    setEditTenant(t)
    setEditName(t.name)
    setEditSlug(t.slug || '')
    setEditPlan(t.plan || 'enterprise')
    setEditActive(t.is_active)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTenant || !editName.trim()) return
    setSavingEdit(true)
    try {
      const res = await csrfFetch(`/api/admin/tenants/${editTenant.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim() || undefined,
          plan: editPlan,
          is_active: editActive,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        addToast({ type: 'success', title: 'Updated', message: `"${editName.trim()}" saved` })
        setEditTenant(null)
        await fetchTenants()
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update organization' })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleToggleActive = async (t: Tenant) => {
    if (togglingId) return
    setTogglingId(t.id)
    const next = !t.is_active
    try {
      const res = await csrfFetch(`/api/admin/tenants/${t.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: next ? 'Activated' : 'Deactivated', message: `"${t.name}" is now ${next ? 'active' : 'inactive'}` })
        await fetchTenants()
      } else {
        const json = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Toggle failed' })
    } finally {
      setTogglingId(null)
    }
  }

  const openMembers = async (t: Tenant) => {
    setMembersOf(t)
    setMembers([])
    setMembersLoading(true)
    try {
      const res = await fetch(`/api/admin/teams/members?tenantId=${encodeURIComponent(t.id)}`, { credentials: 'include' })
      const json = await res.json()
      if (res.ok) setMembers(json.data || [])
      else addToast({ type: 'error', title: 'Failed', message: json.error })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to load members' })
    } finally {
      setMembersLoading(false)
    }
  }

  const handleImpersonate = async (member: TenantMember) => {
    if (impersonatingId) return
    setImpersonatingId(member.id)
    try {
      const res = await csrfFetch('/api/admin/impersonate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Impersonation failed')
      addToast({ type: 'success', title: 'Impersonating', message: `Viewing the app as ${member.name || member.email}` })
      // Hard reload so the sidebar/role/session reflect the impersonated user
      setTimeout(() => { window.location.href = '/dashboard' }, 800)
    } catch (e) {
      addToast({ type: 'error', title: 'Impersonation failed', message: e instanceof Error ? e.message : 'Unknown error' })
      setImpersonatingId(null)
    }
  }

  const handleDelete = async (t: Tenant) => {
    if (deletingId) return
    setDeletingId(t.id)
    try {
      const res = await csrfFetch(`/api/admin/tenants/${t.id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        addToast({ type: 'success', title: 'Deleted', message: `"${t.name}" deleted; members detached` })
        await fetchTenants()
      } else {
        const json = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete organization' })
    } finally {
      setDeletingId(null)
    }
  }

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="flex items-center gap-1.5 text-3xl font-bold text-foreground">
              Organizations
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-[250px]">Enterprise tenants. View members, impersonate an org admin to debug their experience, edit plan/slug, or delete.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h1>
            <p className="text-sm text-muted-foreground">Tenants scoped to Organization admins</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New organization
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} organization{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60 p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-muted-foreground">No organizations yet. Create your first tenant to assign Organization admins.</p>
          <Button className="mt-4 gap-2" size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New organization</Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(t => (
            <Card key={t.id} className={`border-border/60 p-5 ${t.is_active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.slug || t.id}</p>
                </div>
                <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                  {t.is_active ? 'active' : 'inactive'}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {t.member_count} member{t.member_count !== 1 ? 's' : ''}
                <span className="text-border">·</span>
                <Badge variant="outline" className="text-[10px] capitalize">{t.plan || 'enterprise'}</Badge>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openMembers(t)}>
                    <Eye className="h-3.5 w-3.5" /> Members
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Toggle ${t.name} active state`}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => void handleToggleActive(t)}
                          disabled={togglingId === t.id}
                        >
                          {togglingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p className="text-xs">{t.is_active ? 'Deactivate tenant' : 'Activate tenant'}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (confirm(`Delete "${t.name}"? Members will be detached from this org.`)) void handleDelete(t) }}
                    disabled={deletingId === t.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New organization</DialogTitle>
              <DialogDescription>
                Create a tenant. Then assign a user the Organization admin role and attach them to it from the Roles page.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-xs">
              <div className="grid gap-2">
                <Label htmlFor="tenant-name">Organization name</Label>
                <Input id="tenant-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tenant-slug">Slug (optional)</Label>
                <Input id="tenant-slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tenant-plan">Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger id="tenant-plan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Creating…</> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={Boolean(editTenant)} onOpenChange={(o) => !o && setEditTenant(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Edit organization</DialogTitle>
              <DialogDescription>Update tenant details. Changes apply immediately to members scoped to this org.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-xs">
              <div className="grid gap-2">
                <Label htmlFor="edit-tenant-name">Organization name</Label>
                <Input id="edit-tenant-name" required value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tenant-slug">Slug</Label>
                <Input id="edit-tenant-slug" value={editSlug} onChange={e => setEditSlug(e.target.value)} placeholder="acme" />
              </div>
              <div className="grid gap-2">
                <Label>Plan</Label>
                <Select value={editPlan} onValueChange={setEditPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Active</p>
                  <p className="text-[11px] text-muted-foreground">Inactive tenants block member sign-in / team access</p>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
              <Button type="submit" disabled={savingEdit || !editName.trim()}>
                {savingEdit ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={Boolean(membersOf)} onOpenChange={(o) => !o && setMembersOf(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> {membersOf?.name || ''} members
            </DialogTitle>
            <DialogDescription>
              People attached to this tenant. Impersonate any member to view the app as them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto py-2">
            {membersLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : members.length === 0 ? (
              <div className="text-center py-10">
                <UserRound className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No members in this organization yet.</p>
                <p className="text-xs text-muted-foreground">Assign users to this tenant from the Roles page, or add them via the Organization page.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground flex items-center gap-2">
                        {m.name}
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                          {getRoleLabel(normalizeUserRole(m.role))}
                        </Badge>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {normalizeUserRole(m.role) === 'superadmin' ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled>
                                <ShieldAlert className="h-3.5 w-3.5" /> Protected
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Platform admins can't be impersonated</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => void handleImpersonate(m)}
                          disabled={impersonatingId === m.id || Boolean(impersonatingId)}
                        >
                          {impersonatingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                          Impersonate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setMembersOf(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
