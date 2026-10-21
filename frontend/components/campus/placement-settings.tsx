'use client'

/** College profile, departments, batches and placement officers. */
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import type { Batch, Department } from '@/lib/campus/types'
import { Panel, Section } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConsole } from './console-context'
import { Field, errorOf, fieldClass } from './shared'

export function PlacementSettings() {
  return (
    <div className="space-y-8">
      <Profile />
      <Structure />
      <Staff />
    </div>
  )
}

function Profile() {
  const { college, role, reloadCollege } = useConsole()
  const addToast = useToast()
  const [f, setF] = useState({ name: college.name, city: college.city ?? '', state: college.state ?? '', domains: college.email_domains.join(', '), league_public: college.league_public })
  const [busy, setBusy] = useState(false)
  if (role === 'placement_officer') {
    return (
      <Section title="College">
        <Panel className="text-sm text-muted-foreground">{college.name} · domains: {college.email_domains.join(', ') || 'none'}. Only the college admin can change the profile.</Panel>
      </Section>
    )
  }
  return (
    <Section title="College" description="Students whose account email is on one of these domains are verified automatically.">
      <Panel>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const body = { name: f.name, city: f.city || null, state: f.state || null, email_domains: f.domains, league_public: f.league_public, ...(role === 'superadmin' ? { tenant_id: college.tenant_id } : {}) }
              const r = await csrfFetch('/api/campus/college', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
              if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
              addToast({ type: 'success', title: 'Saved' })
              reloadCollege()
            } finally { setBusy(false) }
          }}
        >
          <Field id="p-name" label="Name"><Input id="p-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={160} /></Field>
          <Field id="p-domains" label="Email domains" hint="Comma separated"><Input id="p-domains" value={f.domains} onChange={(e) => setF({ ...f, domains: e.target.value })} /></Field>
          <Field id="p-city" label="City"><Input id="p-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={80} /></Field>
          <Field id="p-state" label="State"><Input id="p-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} maxLength={80} /></Field>
          <label className="flex items-start gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.league_public} onChange={(e) => setF({ ...f, league_public: e.target.checked })} />
            <span>Show the college on the public university league (college name and totals; students appear as first name and initial)</span>
          </label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy} className="min-h-11">Save</Button></div>
        </form>
      </Panel>
    </Section>
  )
}

function Structure() {
  const { college, url, reloadCollege } = useConsole()
  const addToast = useToast()
  const [depts, setDepts] = useState<Array<Partial<Department>>>(college.departments)
  const [batches, setBatches] = useState<Array<Partial<Batch>>>(college.batches)
  const [busy, setBusy] = useState(false)
  const year = new Date().getFullYear()

  const save = async () => {
    setBusy(true)
    try {
      const r = await csrfFetch(url('/api/campus/college/structure'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departments: depts.filter((d) => d.name?.trim() && d.code?.trim()),
          batches: batches.filter((b) => b.name?.trim()).map((b) => ({ ...b, department_id: b.department_id || null, graduation_year: Number(b.graduation_year) })),
        }),
      })
      if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
      addToast({ type: 'success', title: 'Departments and batches saved' })
      reloadCollege()
    } finally { setBusy(false) }
  }

  return (
    <Section title="Departments and batches" description="A batch is a graduation-year cohort, for one department or the whole college.">
      <Panel className="space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Departments</h3>
          {depts.map((d, i) => (
            <div key={d.id ?? `new-${i}`} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <Input aria-label="Department name" value={d.name ?? ''} onChange={(e) => setDepts(depts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Computer Science" maxLength={120} />
              <Input aria-label="Department code" value={d.code ?? ''} onChange={(e) => setDepts(depts.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="CSE" maxLength={20} />
              <Button variant="ghost" size="icon" aria-label={`Remove ${d.name || 'department'}`} onClick={() => setDepts(depts.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setDepts([...depts, { name: '', code: '' }])}><Plus className="mr-1 h-4 w-4" aria-hidden />Add department</Button>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Batches</h3>
          {batches.map((b, i) => (
            <div key={b.id ?? `new-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_110px_auto]">
              <Input aria-label="Batch name" value={b.name ?? ''} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={`${year + 1} CSE`} maxLength={120} />
              <select aria-label="Batch department" className={fieldClass} value={b.department_id ?? ''} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, department_id: e.target.value || null } : x)))}>
                <option value="">Whole college</option>
                {college.departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
              </select>
              <Input aria-label="Graduation year" type="number" min={2000} max={2100} value={b.graduation_year ?? ''} onChange={(e) => setBatches(batches.map((x, j) => (j === i ? { ...x, graduation_year: Number(e.target.value) } : x)))} />
              <Button variant="ghost" size="icon" aria-label={`Remove ${b.name || 'batch'}`} onClick={() => setBatches(batches.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setBatches([...batches, { name: '', department_id: null, graduation_year: year + 1 }])}><Plus className="mr-1 h-4 w-4" aria-hidden />Add batch</Button>
          <p className="text-xs text-muted-foreground">Save new departments first if a batch should belong to one.</p>
        </div>
        <Button onClick={save} disabled={busy} className="min-h-11">Save departments and batches</Button>
      </Panel>
    </Section>
  )
}

function Staff() {
  const { college, url, role, reloadCollege } = useConsole()
  const addToast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = role !== 'placement_officer'
  return (
    <Section title="Placement officers" description="Officers can invite students, run drives and see readiness. They need a CodeSpectra account first.">
      <Panel className="space-y-4">
        {college.staff.length === 0 ? <p className="text-sm text-muted-foreground">No officers yet.</p> : (
          <ul className="divide-y divide-border">
            {college.staff.map((s) => (
              <li key={s.user_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0"><p className="font-medium text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.email}</p></div>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const r = await csrfFetch(url(`/api/campus/college/staff?user=${encodeURIComponent(s.user_id)}`), { method: 'DELETE' })
                    if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
                    reloadCollege()
                  }}>Remove</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const r = await csrfFetch(url('/api/campus/college/staff'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
              if (!r.ok) { addToast({ type: 'error', title: await errorOf(r) }); return }
              setEmail('')
              addToast({ type: 'success', title: 'Officer added' })
              reloadCollege()
            } finally { setBusy(false) }
          }}>
            <Input aria-label="Officer email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="officer@college.edu" required className="sm:max-w-sm" />
            <Button type="submit" disabled={busy} className="min-h-11">Add officer</Button>
          </form>
        )}
      </Panel>
    </Section>
  )
}
