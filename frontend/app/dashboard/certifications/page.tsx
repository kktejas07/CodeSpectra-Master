'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Award, BookOpen, CheckCircle2, ExternalLink, FileBadge2, GraduationCap } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Panel, Section, BentoGrid } from '@/components/app/page-kit'
import { AppBanner, Illustration, bannerBtnPrimary, bannerBtnSecondary } from '@/components/visuals'
import { prepTracks, freeCredentials, type CertTrack } from '@/lib/cert-catalog'
import { Scene } from '@/components/illustrations/scenes'
import { EmptyState } from '@/components/ui/empty-state'

export default function CertificationsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const certificationsTour: TourStep[] = [
        {
          target: '[data-tour="certifications-header"]',
          title: 'Honest certification guide',
          description: 'This page guides users to recognized paid exams and free verifiable credentials.',
          position: 'bottom',
        },
        {
          target: '[data-tour="certifications-prep"]',
          title: 'Study, practice, book exams',
          description: 'Open a prep card to study free, take the official practice, then book the vendor exam.',
          position: 'top',
        },
        {
          target: '[data-tour="certifications-free"]',
          title: 'Free credentials',
          description: 'Complete free provider courses to earn shareable, verifiable certificates.',
          position: 'top',
        },
      ]
      autoPlayPageTour('certifications', certificationsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  const prep = prepTracks()
  const free = freeCredentials()

  return (
    <div className="space-y-8" data-testid="certifications-page">
      {/* Header */}
      <div data-tour="certifications-header">
        <AppBanner
          eyebrow="Certifications"
          title="Get certified the honest way"
          description="The official AWS, Azure and Google exams are paid, so we link you to the free study path, a free official practice exam and the booking page. We also list free credentials you can earn from freeCodeCamp, Microsoft Learn and others."
          actions={
            <>
              <a href="#prep-tracks" className={bannerBtnPrimary}>
                <GraduationCap className="h-4 w-4" aria-hidden /> Prep tracks
              </a>
              <a href="#free-credentials" className={bannerBtnSecondary}>
                <Award className="h-4 w-4" aria-hidden /> Free credentials
              </a>
            </>
          }
          art={
            <Illustration name="certificate" inverse className="w-44" />
          }
        />
      </div>

      <MyCertificates />

      {/* Honesty callout */}
      <Card className="rounded-3xl p-5 border-primary/20 bg-primary/5">
        <div className="flex items-start gap-3">
          <FileBadge2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How this works</p>
            <p>
              <strong className="text-foreground">Prep tracks</strong> prepare you for the real
              vendor exam — passing our practice does <em>not</em> earn the official badge; you
              book that with the vendor. <strong className="text-foreground">Free credentials</strong>{' '}
              are earned by completing the provider&apos;s own (free) course, and are issued by
              the provider.
            </p>
          </div>
        </div>
      </Card>

      {/* Vendor prep tracks */}
      {prep.length > 0 && (
        <div data-tour="certifications-prep" id="prep-tracks" className="scroll-mt-24">
        <Section
          title={<span className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" aria-hidden /> Prepare for a real certification</span>}
          description="Study for free, take the official practice exam, then book the real exam."
        >
          <BentoGrid className="lg:grid-cols-3">
            {prep.map((track) => (
              <PrepCard key={track.id} track={track} />
            ))}
          </BentoGrid>
        </Section>
        </div>
      )}

      {/* Free credentials */}
      {free.length > 0 && (
        <div data-tour="certifications-free" id="free-credentials" className="scroll-mt-24">
        <Section
          title={<span className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" aria-hidden /> Free credentials you can earn today</span>}
          description="Finish these free courses to earn shareable, verifiable certificates."
        >
          <BentoGrid className="lg:grid-cols-3">
            {free.map((track) => (
              <FreeCard key={track.id} track={track} />
            ))}
          </BentoGrid>
        </Section>
        </div>
      )}

      {/* How to earn more CodeSpectra certificates (the user's own are listed under My certificates). */}
      <Panel className="grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[1fr_minmax(0,320px)] lg:p-8">
        <div className="min-w-0">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Earn a CodeSpectra certificate</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
            You can also earn verifiable CodeSpectra certificates by passing assessments,
            levelling up and taking part in events. Each one has a public link anyone can check.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="rounded-full px-5">
              <Link href="/dashboard/assessments">See your assessments</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link href="/dashboard/hackathons">Browse events</Link>
            </Button>
          </div>
        </div>
        <Scene name="certificate-win" className="hidden w-full max-w-[320px] sm:block" />
      </Panel>
    </div>
  )
}

function PrepCard({ track }: { track: CertTrack }) {
  return (
    <Panel
      data-testid={`prep-card-${track.id}`}
      interactive
      className="p-5"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
            style={{ backgroundColor: track.color }}
          >
            {track.icon}
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">
            Prep
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            {track.providerBadge}
          </p>
          <h3 className="text-base font-semibold text-foreground mt-0.5">{track.certName}</h3>
          <p className="text-xs text-muted-foreground mt-1">{track.description}</p>
        </div>
        <div className="text-xs text-muted-foreground space-y-1 border-t border-border/40 pt-3">
          <div>Level: {track.level}</div>
          {track.examCost && <div>Official exam: {track.examCost} (paid)</div>}
        </div>
        <div className="space-y-2">
          <Button className="w-full gap-2" variant="outline" asChild>
            <a href={track.freeStudyUrl} target="_blank" rel="noopener noreferrer">
              <BookOpen className="h-4 w-4" /> Free study path
            </a>
          </Button>
          {track.freePracticeUrl && (
            <Button className="w-full gap-2" variant="outline" asChild>
              <a href={track.freePracticeUrl} target="_blank" rel="noopener noreferrer">
                <CheckCircle2 className="h-4 w-4" /> Free practice exam
              </a>
            </Button>
          )}
          {track.examBookingUrl && (
            <Button className="w-full gap-2" asChild>
              <a href={track.examBookingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Book official exam
              </a>
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}

function FreeCard({ track }: { track: CertTrack }) {
  return (
    <Panel
      data-testid={`free-card-${track.id}`}
      interactive
      className="p-5"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
            style={{ backgroundColor: track.color }}
          >
            {track.icon}
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0 text-green-700 dark:text-green-400 border-green-500/40">
            Free
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            {track.providerBadge}
          </p>
          <h3 className="text-base font-semibold text-foreground mt-0.5">{track.certName}</h3>
          <p className="text-xs text-muted-foreground mt-1">{track.description}</p>
        </div>
        <div className="border-t border-border/40 pt-3">
          <Button className="w-full gap-2" asChild>
            <a href={track.freeStudyUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Start (free)
            </a>
          </Button>
        </div>
      </div>
    </Panel>
  )
}
interface EarnedCertificate {
  id: string
  title: string
  level: string
  source: string
  event_title: string | null
  score_label: string | null
  issued_at: string | null
  verify_url: string
}

/** The user's own CodeSpectra certificates (from certification_attempts). */
function MyCertificates() {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; items: EarnedCertificate[] }>({ status: 'loading', items: [] })

  useEffect(() => {
    let cancelled = false
    fetch('/api/user/certificates', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { certificates?: EarnedCertificate[] }
        if (!cancelled) setState({ status: 'ready', items: Array.isArray(data.certificates) ? data.certificates : [] })
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', items: [] }) })
    return () => { cancelled = true }
  }, [])

  return (
    <div id="my-certificates" className="scroll-mt-24">
      <Section
        title={<span className="flex items-center gap-2"><FileBadge2 className="h-5 w-5 text-primary" aria-hidden /> My certificates</span>}
        description="Certificates you have earned on CodeSpectra. Each has a public link anyone can check."
      >
        {state.status === 'loading' ? (
          <Panel className="p-5 text-sm text-muted-foreground">Loading your certificates…</Panel>
        ) : state.status === 'error' ? (
          <Panel className="p-5 text-sm text-destructive" role="alert">We could not load your certificates. Refresh the page to try again.</Panel>
        ) : state.items.length === 0 ? (
          <EmptyState
            compact
            illustration="certificate"
            title="No certificates yet"
            description="Pass an assessment, finish a course or take part in an event to earn one."
          />
        ) : (
          <BentoGrid className="lg:grid-cols-3">
            {state.items.map((c) => (
              <Panel key={c.id} className="p-5">
                <div className="flex h-full flex-col gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{c.title}</h3>
                    {c.event_title && <p className="text-sm text-muted-foreground">{c.event_title}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.level && <Badge variant="secondary">{c.level}</Badge>}
                    {c.score_label && <Badge variant="outline">{c.score_label}</Badge>}
                  </div>
                  {c.issued_at && (
                    <p className="text-xs text-muted-foreground">
                      Issued {new Date(c.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                  <div className="mt-auto">
                    <Button asChild size="sm" variant="outline" className="rounded-full">
                      <Link href={c.verify_url} target="_blank" rel="noopener noreferrer">
                        View certificate <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Panel>
            ))}
          </BentoGrid>
        )}
      </Section>
    </div>
  )
}
