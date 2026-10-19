'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, Video } from 'lucide-react'
import { PageHeader } from '@/components/app/page-kit'
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
  const [form, setForm] = useState({
    title: '',
    type: 'technical',
    role: '',
    candidate_email: '',
    scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    duration_minutes: 60,
    resume_info: '',
  })

  // First-visit guided tour (same pattern as the other dashboard pages).
  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const interviewScheduleTour: TourStep[] = [
        {
          target: '[data-tour="interview-schedule-header"]',
          title: 'Book interviews for candidates',
          description: 'This page books a new interview slot for a registered candidate.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-schedule-submit"]',
          title: 'Schedule the interview',
          description: 'Click Schedule Interview to book the slot and open the interview room.',
          position: 'top',
        },
        {
          target: '[data-tour="interview-schedule-form"]',
          title: 'Enter the candidate details',
          description: 'Pro tip: use a registered candidate email or scheduling fails.',
          position: 'top',
        },
      ]
      autoPlayPageTour('interview-schedule', interviewScheduleTour)}
  }, [gate.ready, startTour, setTourSeen])

  async function schedule() {
    if (!form.title || !form.role || !form.candidate_email) return
    setBusy(true); setError(null)
    try {
      const res = await csrfFetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, type: form.type, role: form.role,
          // Resolved on the server (scoped to candidates + your organisation).
          candidate_email: form.candidate_email.trim(),
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
    <div className="space-y-6">
      <div className="h-4 w-32 bg-muted/60 rounded animate-pulse" />
      <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
      <SkeletonCard />
    </div>
  )

  return (
    <div className="space-y-6">
      <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to interviews
      </Link>

      <div data-tour="interview-schedule-header">
        <PageHeader
          className="mb-0"
          icon={<Video aria-hidden />}
          title="Schedule interview"
          description="Set up an interview with a registered candidate — pick the type, time and length."
        />
      </div>

      <Card className="max-w-3xl rounded-3xl border-border/70 p-6 space-y-4" data-tour="interview-schedule-form">
        <div>
          <Label htmlFor="iv-title">Interview title</Label>
          <Input id="iv-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Senior Frontend Screening" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="iv-type">Type</Label>
            <select id="iv-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
              <option value="system-design">System design</option>
              <option value="coding">Coding</option>
            </select>
          </div>
          <div>
            <Label htmlFor="iv-role">Role</Label>
            <Input id="iv-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Frontend Engineer" />
          </div>
        </div>
        <div>
          <Label htmlFor="iv-email">Candidate email</Label>
          <Input id="iv-email" value={form.candidate_email} onChange={(e) => setForm((f) => ({ ...f, candidate_email: e.target.value }))} placeholder="candidate@company.com" type="email" />
          <p className="text-xs text-muted-foreground mt-1">The email the candidate signed up to CodeSpectra with.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="iv-when">Scheduled at</Label>
            <Input id="iv-when" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="iv-duration">Duration (minutes)</Label>
            <Input id="iv-duration" type="number" min={15} max={180} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Label htmlFor="iv-context">Resume / context (optional)</Label>
          <Textarea id="iv-context" rows={4} value={form.resume_info} onChange={(e) => setForm((f) => ({ ...f, resume_info: e.target.value }))} placeholder="Paste resume text or notes about the candidate…" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={schedule} disabled={busy} data-tour="interview-schedule-submit">
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Schedule interview
        </Button>
      </Card>
    </div>
  )
}
