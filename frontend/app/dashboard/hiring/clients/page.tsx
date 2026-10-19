'use client'

import { useState } from 'react'
import { Building2, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { Field, InlineError } from '@/components/hiring/ui'
import { atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import { initials } from '@/components/hiring/lib/labels'
import type { AtsClient } from '@/components/hiring/lib/types'

type Contact = { name: string; email: string; phone?: string }
type Draft = { id?: string; name: string; logo_url: string; contacts: Contact[] }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function HiringClientsPage() {
  const addToast = useToast()
  const confirm = useConfirm()
  const q = useAts<AtsClient[]>('/api/ats/clients', 'clients')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (c?: AtsClient) => {
    setError(null)
    setDraft(c ? { id: c.id, name: c.name, logo_url: c.logo_url ?? '', contacts: c.contacts ?? [] } : { name: '', logo_url: '', contacts: [{ name: '', email: '' }] })
  }

  const save = async () => {
    if (!draft) return
    setError(null)
    if (!draft.name.trim()) return setError('Add the client’s name.')
    const contacts = draft.contacts.filter((c) => c.name.trim() || c.email.trim())
    if (contacts.some((c) => !EMAIL.test(c.email.trim()))) return setError('Every contact needs a valid email.')
    if (draft.logo_url && !/^https:\/\//i.test(draft.logo_url)) return setError('The logo link must start with https://')
    setSaving(true)
    const body = { name: draft.name.trim(), logo_url: draft.logo_url.trim() || null, contacts: contacts.map((c) => ({ name: c.name.trim(), email: c.email.trim().toLowerCase(), phone: c.phone?.trim() || undefined })) }
    try {
      if (draft.id) await atsSend(`/api/ats/clients/${encodeURIComponent(draft.id)}`, 'PATCH', body)
      else await atsSend('/api/ats/clients', 'POST', body)
      addToast({ type: 'success', title: draft.id ? 'Client saved' : 'Client added' })
      setDraft(null)
      q.reload()
    } catch (e) { setError(errorMessage(e)) } finally { setSaving(false) }
  }

  const remove = async (c: AtsClient) => {
    if (!(await confirm({ title: `Delete ${c.name}?`, description: 'You can delete a client once no jobs or team members are linked to it.', confirmText: 'Delete', destructive: true }))) return
    try {
      await atsSend(`/api/ats/clients/${encodeURIComponent(c.id)}`, 'DELETE')
      addToast({ type: 'success', title: 'Client deleted' })
      q.setData((d) => (d ? d.filter((x) => x.id !== c.id) : d))
    } catch (e) {
      addToast({ type: 'error', title: 'Could not delete', message: errorMessage(e) })
    }
  }

  const setContact = (i: number, patch: Partial<Contact>) => setDraft((d) => (d ? { ...d, contacts: d.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : d))

  return (
    <HiringShell
      title="Clients"
      description="Companies you hire for. Link jobs to a client and invite their contacts to review candidates."
      icon={<Building2 />}
      actions={<Button className="rounded-full" onClick={() => open()}><Plus aria-hidden /> New client</Button>}
    >
      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && (
        q.data.length === 0 ? (
          <EmptyState illustration="team" title="No clients yet" description="Hiring only for your own company? You can skip this. Staffing teams add each client here." actionLabel="New client" onAction={() => open()} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {q.data.map((c) => (
              <Panel key={c.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt="" className="h-10 w-10 rounded-xl border border-border object-contain" />
                  ) : (
                    <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">{initials(c.name)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{(c.contacts?.length ?? 0) === 1 ? '1 contact' : `${c.contacts?.length ?? 0} contacts`}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => open(c)} aria-label={`Edit ${c.name}`}><Pencil aria-hidden /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 aria-hidden /></Button>
                </div>
                {(c.contacts?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {c.contacts!.slice(0, 3).map((p) => (
                      <li key={p.email} className="truncate text-muted-foreground"><span className="text-foreground">{p.name || p.email}</span>{p.name ? ` · ${p.email}` : ''}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>
        )
      )}

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o && !saving) setDraft(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit client' : 'New client'}</DialogTitle>
            <DialogDescription>Contacts are who you&apos;ll invite to review candidates. Invite them from the Team page.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Field label="Client name" htmlFor="cl-name"><Input id="cl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} /></Field>
              <Field label="Logo link (optional)" htmlFor="cl-logo"><Input id="cl-logo" type="url" value={draft.logo_url} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value })} placeholder="https://" /></Field>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Contacts</p>
                {draft.contacts.map((c, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input aria-label={`Contact ${i + 1} name`} placeholder="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                    <Input aria-label={`Contact ${i + 1} email`} placeholder="Email" type="email" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
                    <Button variant="ghost" size="icon" onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })} aria-label={`Remove contact ${i + 1}`}><X aria-hidden /></Button>
                    <Input aria-label={`Contact ${i + 1} phone`} placeholder="Phone (optional)" type="tel" value={c.phone ?? ''} onChange={(e) => setContact(i, { phone: e.target.value })} className="sm:col-span-2" />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, { name: '', email: '' }] })}><Plus aria-hidden /> Add contact</Button>
              </div>
              <InlineError message={error} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HiringShell>
  )
}
