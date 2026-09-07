'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft } from 'lucide-react'
import { SkeletonCard, SkeletonButton } from '@/components/ui/skeleton-boneyard'
import Link from 'next/link'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

export default function ScheduleInterviewPage() {
  const gate = usePageGuard('user')

  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<{ id: string; email: string; name?: string }[]>([])
  const [form, setForm] = useState({
    title: '',
    type: 'technical',
    role: '',
    candidate_email: '',
    scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    duration_minutes: 60,
    resume_info: '',
  })

  useEffect(() => {
    fetch('/api/admin/users', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setUsers(d.users || d.items || []))
      .catch(() => {})
  }, [])

  // First-visit guided tour (same pattern as the other dashboard pages).
  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const interviewScheduleTour: TourStep[] = [
        {
          target: '[data-tour="interview-schedule-header"]',
          title: 'Schedule an interview',
          description: 'Set up a new interview by filling in the details below.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-schedule-submit"]',
          title: 'Send the invite',
          description: 'Click here to schedule the interview and notify the candidate.',
          position: 'top',
        },
        {
          target: '[data-tour="interview-schedule-form"]',
          title: 'Interview details',
          description: 'Add the title, role, candidate email, and time slot for the session.',
          position: 'top',
        },
      ]
      autoPlayPageTour('interview-schedule', interviewScheduleTour)}
  }, [gate.ready, startTour, setTourSeen])

  async function schedule() {
    if (!form.title || !form.role || !form.candidate_email) return
    setBusy(true); setError(null)
    try {
      const candidate = users.find((u) => u.email.toLowerCase() === form.candidate_email.toLowerCase())
      if (!candidate) throw new Error(`User with email "${form.candidate_email}" not found`)

      const res = await csrfFetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, type: form.type, role: form.role,
          candidate_id: candidate.id,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_minutes: form.duration_minutes,
          resume_info: form.resume_info || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      router.push(`/dashboard/interviews/${j.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  if (!gate.ready) return (
    <div className="max-w-2xl space-y-6">
      <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
      <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
      <SkeletonCard />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to interviews
      </Link>

      <h1 className="text-3xl font-bold" data-tour="interview-schedule-header">Schedule Interview</h1>

      <Card className="p-6 space-y-4" data-tour="interview-schedule-form">
        <div>
          <Label>Interview Title</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Senior Frontend Screening" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm">
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
              <option value="system-design">System Design</option>
              <option value="coding">Coding</option>
            </select>
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Frontend Engineer" />
          </div>
        </div>
        <div>
          <Label>Candidate Email</Label>
          <Input value={form.candidate_email} onChange={(e) => setForm((f) => ({ ...f, candidate_email: e.target.value }))} placeholder="candidate@company.com" type="email" />
          <p className="text-xs text-muted-foreground mt-1">Must be a registered user on the platform</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Scheduled At</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
          <div>
            <Label>Duration (minutes)</Label>
            <Input type="number" min={15} max={180} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Label>Resume / Context (optional)</Label>
          <Textarea rows={4} value={form.resume_info} onChange={(e) => setForm((f) => ({ ...f, resume_info: e.target.value }))} placeholder="Paste resume text or notes about the candidate..." />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={schedule} disabled={busy} data-tour="interview-schedule-submit">
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Schedule Interview
        </Button>
      </Card>
    </div>
  )
}
