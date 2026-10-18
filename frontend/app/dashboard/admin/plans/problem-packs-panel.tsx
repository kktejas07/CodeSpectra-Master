'use client'

import { useEffect, useState } from 'react'
import { Loader2, Package, Plus, Save, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/app/page-kit'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'

interface Pack {
  id: string
  name: string
  description?: string
  price: number
  currency: string
  problem_slugs: string[]
  topics: string[]
  included_in_plans: string[]
  active: boolean
}

type Draft = Omit<Pack, 'problem_slugs' | 'topics' | 'included_in_plans' | 'price'> & {
  price: string
  problem_slugs: string
  topics: string
  included_in_plans: string
}

const BUILT_IN = new Set(['problem_pack_50'])

function toDraft(p: Pack): Draft {
  return {
    ...p,
    price: String(p.price ?? ''),
    problem_slugs: (p.problem_slugs || []).join('\n'),
    topics: (p.topics || []).join(', '),
    included_in_plans: (p.included_in_plans || []).join(', '),
  }
}

const EMPTY: Draft = {
  id: '', name: '', description: '', price: '', currency: 'INR',
  problem_slugs: '', topics: '', included_in_plans: 'pro, enterprise', active: true,
}

/**
 * Problem packs: one-time purchases that unlock the problems assigned to them
 * (by slug or by topic). Problems in a pack are locked for everyone else.
 */
export function ProblemPacksPanel() {
  const addToast = useToast()
  const confirm = useConfirm()
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await fetch('/api/admin/plans/packs', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error()
      setPacks(Array.isArray(j.packs) ? j.packs : [])
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/plans/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...draft,
          price: Number(draft.price),
          problem_slugs: draft.problem_slugs,
          topics: draft.topics,
          included_in_plans: draft.included_in_plans,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not save')
      addToast({ type: 'success', title: 'Pack saved', message: `${draft.name} is updated.` })
      setDraft(null)
      await load()
    } catch (e) {
      addToast({ type: 'error', title: 'Pack not saved', message: e instanceof Error ? e.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: Pack) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      description: 'Its problems unlock for everyone. People who bought it keep it on their account.',
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    const res = await csrfFetch(`/api/admin/plans/packs?id=${encodeURIComponent(p.id)}`, { method: 'DELETE', credentials: 'include' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      addToast({ type: 'error', title: 'Pack not deleted', message: typeof j.error === 'string' ? j.error : 'Try again.' })
      return
    }
    addToast({ type: 'success', title: 'Pack deleted', message: `${p.name} was removed.` })
    if (draft?.id === p.id) setDraft(null)
    await load()
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Package className="h-5 w-5 text-primary" aria-hidden /> Problem packs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One-time purchases. Problems in a pack are locked unless the user bought it or their plan is included. Purchases never expire.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => { setDraft({ ...EMPTY }); setIsNew(true) }}>
          <Plus className="h-4 w-4" aria-hidden /> New pack
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading packs" /></div>
      ) : loadFailed ? (
        <EmptyState compact illustration="error" title="Couldn't load packs" description="Check your connection and try again." actionLabel="Try again" onAction={() => void load()} />
      ) : packs.length === 0 ? (
        <EmptyState compact illustration="billing" title="No packs yet" description="Create a pack and assign problems to it." />
      ) : (
        <div className="space-y-2">
          {packs.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {p.name}
                  <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  {!p.active ? <Badge variant="outline" className="text-xs">Not on sale</Badge> : null}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {p.currency} {p.price} · {p.problem_slugs?.length || 0} problems · {p.topics?.length ? `topics: ${p.topics.join(', ')}` : 'no topics'}
                  {p.included_in_plans?.length ? ` · included in ${p.included_in_plans.join(', ')}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDraft(toDraft(p)); setIsNew(false) }}>Edit</Button>
                {!BUILT_IN.has(p.id) ? (
                  <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => void remove(p)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="mt-6 grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pack-id" className="text-xs font-medium text-muted-foreground">Pack ID</label>
            <Input id="pack-id" value={draft.id} onChange={(e) => set({ id: e.target.value })} disabled={!isNew} className="mt-1 font-mono" placeholder="pack_graphs" />
          </div>
          <div>
            <label htmlFor="pack-name" className="text-xs font-medium text-muted-foreground">Name</label>
            <Input id="pack-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className="mt-1" placeholder="Graph algorithms pack" />
          </div>
          <div>
            <label htmlFor="pack-price" className="text-xs font-medium text-muted-foreground">Price</label>
            <Input id="pack-price" type="number" min={0} step="0.01" value={draft.price} onChange={(e) => set({ price: e.target.value })} className="mt-1 tabular-nums" />
          </div>
          <div>
            <label htmlFor="pack-currency" className="text-xs font-medium text-muted-foreground">Currency</label>
            <Input id="pack-currency" value={draft.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} maxLength={3} className="mt-1 font-mono" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pack-desc" className="text-xs font-medium text-muted-foreground">Description</label>
            <Input id="pack-desc" value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pack-slugs" className="text-xs font-medium text-muted-foreground">Problems (one slug per line)</label>
            <Textarea id="pack-slugs" value={draft.problem_slugs} onChange={(e) => set({ problem_slugs: e.target.value })} rows={5} className="mt-1 font-mono text-xs" placeholder={'two-sum\nlru-cache'} />
          </div>
          <div>
            <label htmlFor="pack-topics" className="text-xs font-medium text-muted-foreground">Topics (every problem with one of these)</label>
            <Input id="pack-topics" value={draft.topics} onChange={(e) => set({ topics: e.target.value })} className="mt-1" placeholder="graphs, dynamic-programming" />
          </div>
          <div>
            <label htmlFor="pack-plans" className="text-xs font-medium text-muted-foreground">Included in plans</label>
            <Input id="pack-plans" value={draft.included_in_plans} onChange={(e) => set({ included_in_plans: e.target.value })} className="mt-1 font-mono" placeholder="pro, enterprise" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="pack-active" checked={draft.active} onCheckedChange={(v) => set({ active: v })} />
            <label htmlFor="pack-active" className="text-sm text-foreground">On sale</label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !draft.id.trim() || !draft.name.trim()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" aria-hidden />} Save pack
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  )
}
