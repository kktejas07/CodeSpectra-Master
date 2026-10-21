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
import { useT } from '@/lib/i18n/client'

export default function ScheduleInterviewPage() {
  const { t } = useT()
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
          title: t('career.bookInterviewsForCandidates'),
          description: t('career.thisPageBooksANewInterview7dc'),
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-schedule-submit"]',
          title: t('career.scheduleTheInterview'),
          description: t('career.clickScheduleInterviewToBookThe3af'),
          position: 'top',
        },
        {
          target: '[data-tour="interview-schedule-form"]',
          title: t('career.enterTheCandidateDetails'),
          description: t('career.proTipUseARegisteredCandidatee94'),
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
        <ArrowLeft className="h-3 w-3" />{' '}{t('career.backToInterviews')}</Link>

      <div data-tour="interview-schedule-header">
        <PageHeader
          className="mb-0"
          icon={<Video aria-hidden />}
          title={t('career.scheduleInterview')}
          description={t('career.setUpAnInterviewWithA7f3')}
        />
      </div>

      <Card className="max-w-3xl rounded-3xl border-border/70 p-6 space-y-4" data-tour="interview-schedule-form">
        <div>
          <Label htmlFor="iv-title">{t('career.interviewTitle')}</Label>
          <Input id="iv-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('career.seniorFrontendScreening')} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="iv-type">{t('career.type')}</Label>
            <select id="iv-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
              <option value="technical">{t('career.technical')}</option>
              <option value="behavioral">{t('career.behavioral')}</option>
              <option value="system-design">{t('career.systemDesign')}</option>
              <option value="coding">{t('career.coding')}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="iv-role">{t('career.role')}</Label>
            <Input id="iv-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder={t('career.frontendEngineer')} />
          </div>
        </div>
        <div>
          <Label htmlFor="iv-email">{t('career.candidateEmail')}</Label>
          <Input id="iv-email" value={form.candidate_email} onChange={(e) => setForm((f) => ({ ...f, candidate_email: e.target.value }))} placeholder="candidate@company.com" type="email" />
          <p className="text-xs text-muted-foreground mt-1">{t('career.theEmailTheCandidateSignedUp0aa')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="iv-when">{t('career.scheduledAt')}</Label>
            <Input id="iv-when" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="iv-duration">{t('career.durationMinutes')}</Label>
            <Input id="iv-duration" type="number" min={15} max={180} value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Label htmlFor="iv-context">{t('career.resumeContextOptional')}</Label>
          <Textarea id="iv-context" rows={4} value={form.resume_info} onChange={(e) => setForm((f) => ({ ...f, resume_info: e.target.value }))} placeholder={t('career.pasteResumeTextOrNotesAbout1a5')} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={schedule} disabled={busy} data-tour="interview-schedule-submit">
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}{t('career.scheduleInterview')}</Button>
      </Card>
    </div>
  )
}
