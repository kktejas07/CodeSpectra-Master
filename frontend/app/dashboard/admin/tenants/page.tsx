'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Building2, Users, Plus, Loader2, Trash2, Search, HelpCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Tenant {
  id: string
  name: string
  slug?: string
  plan?: string
  is_active: boolean
  created_at: string
  member_count: number
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
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
                    <p className="text-xs max-w-[250px]">Enterprise tenants. Assign a user the Organization admin role and attach them to a tenant here to give them a scoped org.</p>
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
            <Card key={t.id} className="border-border/60 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.slug || t.id}</p>
                </div>
                <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                  {t.is_active ? 'active' : 'inactive'}
                </Badge>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> {t.member_count} member{t.member_count !== 1 ? 's' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{t.plan || 'enterprise'}</Badge>
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
                <select
                  id="tenant-plan"
                  value={plan}
                  onChange={e => setPlan(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="enterprise">Enterprise</option>
                  <option value="team">Team</option>
                  <option value="free">Free</option>
                </select>
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
    </div>
  )
}
