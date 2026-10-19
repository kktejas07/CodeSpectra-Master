'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Building2, Users, Plus, Loader2, Trash2, Search, HelpCircle, Pencil, Eye, EyeOff, LogIn, ShieldAlert, RefreshCw, UserRound, Mail, CheckCircle2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getRoleLabel, normalizeUserRole } from '@/lib/rbac'
import { SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { PageHeader, StatCard, Panel, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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
  const confirm = useConfirm()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('enterprise')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

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

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberPassword, setNewMemberPassword] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('user')
  const [showNewMemberPassword, setShowNewMemberPassword] = useState(false)

  const [editingMember, setEditingMember] = useState<TenantMember | null>(null)
  const [editMemberEmail, setEditMemberEmail] = useState('')
  const [editMemberPassword, setEditMemberPassword] = useState('')
  const [showEditMemberPassword, setShowEditMemberPassword] = useState(false)
  const [savingMemberEdit, setSavingMemberEdit] = useState(false)
  const [deletingMember, setDeletingMember] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [loadError, setLoadError] = useState(false)

  const fetchTenants = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/tenants', { credentials: 'include' })
      const json = await res.json()
      if (res.ok) { setTenants(json.data || []); setLoadError(false) }
      else { setLoadError(true); addToast({ type: 'error', title: 'Failed', message: json.error }) }
    } catch {
      setLoadError(true)
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
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          plan,
          admin_name: adminName.trim(),
          admin_email: adminEmail.trim(),
          admin_password: adminPassword,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Created',
          message: json.admin
            ? `Organization "${name.trim()}" created with org admin ${json.admin.email}`
            : `Organization "${name.trim()}" created`,
        })
        setName(''); setSlug(''); setPlan('enterprise')
        setAdminName(''); setAdminEmail(''); setAdminPassword('')
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

  const handleResendCredentials = async (member: TenantMember) => {
    try {
      const res = await csrfFetch(`/api/admin/users/${member.id}/resend-credentials`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json()
      if (res.ok) {
        addToast({ type: 'success', title: 'Email sent', message: `Password reset link sent to ${member.email}` })
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to send email' })
    }
  }

  const handleUpdateMemberRole = async (member: TenantMember, newRole: string) => {
    try {
      const res = await csrfFetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Role updated', message: `${member.name || member.email} is now ${getRoleLabel(normalizeUserRole(newRole))}` })
        if (membersOf) await openMembers(membersOf)
      } else {
        const json = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update role' })
    }
  }

  const handleEditMember = async () => {
    if (!editingMember || savingMemberEdit) return
    setSavingMemberEdit(true)
    try {
      const body: Record<string, string> = {}
      if (editMemberEmail.trim() && editMemberEmail.trim() !== editingMember.email) body.email = editMemberEmail.trim()
      if (editMemberPassword.trim()) body.password = editMemberPassword.trim()
      if (Object.keys(body).length === 0) {
        setEditingMember(null)
        return
      }
      const res = await csrfFetch(`/api/admin/users/${editingMember.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Member updated', message: `${editingMember.name || editingMember.email} updated successfully` })
        setEditingMember(null)
        setEditMemberPassword('')
        if (membersOf) await openMembers(membersOf)
      } else {
        const json = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update member' })
    } finally {
      setSavingMemberEdit(false)
    }
  }

  const handleDeleteMember = async () => {
    if (!editingMember || deletingMember) return
    const ok = await confirm({
      title: 'Delete member?',
      description: `Remove ${editingMember.name || editingMember.email} from this organization. This cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingMember(true)
    try {
      const res = await csrfFetch(`/api/admin/users/${editingMember.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Member deleted', message: `${editingMember.name || editingMember.email} has been removed` })
        setEditingMember(null)
        setEditMemberPassword('')
        if (membersOf) await openMembers(membersOf)
      } else {
        const json = await res.json().catch(() => ({}))
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete member' })
    } finally {
      setDeletingMember(false)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!membersOf || addingMember) return
    if (!newMemberEmail.trim()) return
    setAddingMember(true)
    try {
      const res = await csrfFetch('/api/admin/teams/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newMemberEmail.trim(),
          name: newMemberName.trim(),
          password: newMemberPassword || undefined,
          tenantId: membersOf.id,
          role: newMemberRole,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Member added',
          message: `${json.user.email} added to "${membersOf.name}"`,
        })
        setNewMemberName(''); setNewMemberEmail(''); setNewMemberPassword(''); setNewMemberRole('user')
        setAddMemberOpen(false)
        await openMembers(membersOf)
      } else {
        addToast({ type: 'error', title: 'Failed', message: json.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to add member' })
    } finally {
      setAddingMember(false)
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
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="team"
          className="mb-0"
          title={
            <span className="inline-flex items-center gap-1.5">
              Organizations
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs max-w-62.5">Enterprise tenants. View members, impersonate an org admin to debug their experience, edit plan/slug, or delete.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Company and college accounts. Each one has its own organization admins and members."
          icon={<Building2 />}
          actions={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New organization
            </Button>
          }
        />
      </div>

      {!loading && tenants.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Organizations" value={tenants.length} icon={<Building2 />} />
          <StatCard label="Active" value={tenants.filter(t => t.is_active).length} icon={<CheckCircle2 />} />
          <StatCard label="Members" value={tenants.reduce((n, t) => n + (t.member_count || 0), 0)} icon={<Users />} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" aria-label="Search organizations" />
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{filtered.length} organization{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : loadError && tenants.length === 0 ? (
        <EmptyState
          illustration="error"
          title="Couldn't load organizations"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void fetchTenants()}
        />
      ) : filtered.length === 0 ? (
        search ? (
          <EmptyState variant="search" title="No organizations match your search" description="Try a different name or slug." />
        ) : (
          <EmptyState
            illustration="team"
            title="No organizations yet"
            description="Create one, then add its organization admins."
            actionLabel="New organization"
            onAction={() => setCreateOpen(true)}
          />
        )
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {filtered.map(t => (
            <Panel key={t.id} interactive className={`p-5 ${t.is_active ? '' : 'opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.slug || t.id}</p>
                </div>
                <Badge variant={t.is_active ? 'success' : 'secondary'} className="text-[11px] shrink-0">
                  {t.is_active ? 'Active' : 'Inactive'}
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
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={async () => {
                    const ok = await confirm({
                      title: `Delete "${t.name}"?`,
                      description: 'Members will be detached from this org. This cannot be undone.',
                      confirmText: 'Delete',
                      destructive: true,
                    })
                    if (ok) void handleDelete(t)
                  }}
                    disabled={deletingId === t.id}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </BentoGrid>
      )}

      {/* Create drawer */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New organization</SheetTitle>
            <SheetDescription>
              Create a tenant. Optionally provision the org admin account in the same step, then impersonate them to verify their experience.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreate} className="px-4 pb-4">
            <div className="grid gap-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tenant-name">Organization name</Label>
                  <Input id="tenant-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant-slug">Slug (optional)</Label>
                  <Input id="tenant-slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme" />
                </div>
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
              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">Org admin account <span className="font-normal text-muted-foreground">(optional)</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="tenant-admin-name">Name</Label>
                    <Input id="tenant-admin-name" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tenant-admin-email">Email</Label>
                    <Input id="tenant-admin-email" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="jane@acme.com" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenant-admin-password">Password</Label>
                  <PasswordInput id="tenant-admin-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Min 8 characters" />
                </div>
                <p className="text-[11px] text-muted-foreground">Leave email empty to create the org without an admin and assign one later.</p>
              </div>
            </div>
            <SheetFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Creating…</> : 'Create'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Edit drawer */}
      <Sheet open={Boolean(editTenant)} onOpenChange={(o) => !o && setEditTenant(null)}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit organization</SheetTitle>
            <SheetDescription>Update tenant details. Changes apply immediately to members scoped to this org.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleEdit} className="px-4 pb-4">
            <div className="grid gap-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-tenant-name">Organization name</Label>
                  <Input id="edit-tenant-name" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-tenant-slug">Slug</Label>
                  <Input id="edit-tenant-slug" value={editSlug} onChange={e => setEditSlug(e.target.value)} placeholder="acme" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Plan</Label>
                  <Select value={editPlan} onValueChange={setEditPlan}>
                    <SelectTrigger aria-label="Plan"><SelectValue /></SelectTrigger>
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
            </div>
            <SheetFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
              <Button type="submit" disabled={savingEdit || !editName.trim()}>
                {savingEdit ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Members drawer */}
      <Sheet open={Boolean(membersOf)} onOpenChange={(o) => !o && setMembersOf(null)}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> {membersOf?.name || ''} members
            </SheetTitle>
            <SheetDescription>
              People attached to this tenant. Add members or impersonate one to view the app as them.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setAddMemberOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add member
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {membersLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : members.length === 0 ? (
                <EmptyState
                  illustration="team"
                  title="No members in this organization yet"
                  description="Use Add member to create one and attach it to this organization."
                  className="border-0 bg-transparent py-6 md:py-8"
                />
              ) : (
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground flex items-center gap-2">
                          {m.name}
                          {normalizeUserRole(m.role) === 'superadmin' ? (
                            <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                              {getRoleLabel(normalizeUserRole(m.role))}
                            </Badge>
                          ) : (
                            <Select
                              value={normalizeUserRole(m.role)}
                              onValueChange={(v) => void handleUpdateMemberRole(m, v)}
                            >
                              <SelectTrigger aria-label="Member role" className="h-6 w-auto min-w-25 text-[10px] px-2 py-0" onClick={(e) => e.stopPropagation()}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="tenant_admin">Org admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
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
                          <div className="flex items-center gap-1">
                            <Button aria-label="Edit email / password"
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => {
                                setEditingMember(m)
                                setEditMemberEmail(m.email)
                                setEditMemberPassword('')
                              }}
                              title="Edit email / password"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button aria-label="Send password reset email"
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => void handleResendCredentials(m)}
                              title="Send password reset email"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
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
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setMembersOf(null)}>Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddMember}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
              <DialogDescription>
                Create a user and attach them to {membersOf?.name || 'this organization'}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="member-name">Name</Label>
                  <Input id="member-name" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="member-email">Email</Label>
                  <Input id="member-email" type="email" required value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="jane@acme.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="member-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="member-password"
                      type={showNewMemberPassword ? 'text' : 'password'}
                      value={newMemberPassword}
                      onChange={e => setNewMemberPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewMemberPassword(!showNewMemberPassword)}
                    aria-label={showNewMemberPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewMemberPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="member-role">Role</Label>
                  <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                    <SelectTrigger id="member-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="tenant_admin">Org admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Org Admin can manage this tenant's team. Pick User for regular members.</p>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addingMember || !newMemberEmail.trim()}>
                {addingMember ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Adding…</> : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit member dialog */}
      <Dialog open={Boolean(editingMember)} onOpenChange={(o) => { if (!o) { setEditingMember(null); setEditMemberPassword(''); setShowEditMemberPassword(false) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>
              Update email or reset password for <strong>{editingMember?.name || editingMember?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-xs">
            <div className="grid gap-2">
              <Label htmlFor="edit-member-email">Email</Label>
              <Input
                id="edit-member-email"
                type="email"
                value={editMemberEmail}
                onChange={e => setEditMemberEmail(e.target.value)}
                placeholder="member@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-member-password">New password <span className="text-muted-foreground">(leave blank to keep current)</span></Label>
              <div className="relative">
                <Input
                  id="edit-member-password"
                  type={showEditMemberPassword ? 'text' : 'password'}
                  value={editMemberPassword}
                  onChange={e => setEditMemberPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditMemberPassword(!showEditMemberPassword)}
                    aria-label={showEditMemberPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEditMemberPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="destructive" size="sm" onClick={() => void handleDeleteMember()} disabled={deletingMember} aria-label="Delete member">
              {deletingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => { setEditingMember(null); setEditMemberPassword(''); setShowEditMemberPassword(false) }}>Cancel</Button>
            <Button onClick={() => void handleEditMember()} disabled={savingMemberEdit || !editMemberEmail.trim()}>
              {savingMemberEdit ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
