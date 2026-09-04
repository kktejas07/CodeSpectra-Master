'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Award, BookOpen, CheckCircle2, ExternalLink, FileBadge2, GraduationCap } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { prepTracks, freeCredentials, type CertTrack } from '@/lib/cert-catalog'

export default function CertificationsPage() {
  const gate = usePageGuard('user')

  if (!gate.ready) return null

  const prep = prepTracks()
  const free = freeCredentials()

  return (
    <div className="space-y-8" data-testid="certifications-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Certifications</h1>
        <p className="text-muted-foreground max-w-3xl">
          Real, recognized certifications — the honest guide. The official AWS, Azure, and
          Google exams are paid, so we give you the free study path, a free official practice
          exam, and the booking link. We also curate free verifiable credentials you can earn
          directly from freeCodeCamp, Microsoft Learn, and more.
        </p>
      </div>

      {/* Honesty callout */}
      <Card className="p-4 border-primary/20 bg-primary/5">
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
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">Prepare for a real certification</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Study free, take the official practice exam, then book the real exam.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prep.map((track) => (
              <PrepCard key={track.id} track={track} />
            ))}
          </div>
        </section>
      )}

      {/* Free credentials */}
      {free.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-green-500" />
            <h2 className="text-xl font-bold">Free credentials you can earn today</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete these free courses to earn shareable, verifiable certificates.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {free.map((track) => (
              <FreeCard key={track.id} track={track} />
            ))}
          </div>
        </section>
      )}

      {/* Platform certs note */}
      <Card className="p-5 border-border/40">
        <div className="flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Also on CodeSpectra</p>
            <p>
              You can still earn verifiable CodeSpectra certificates through assessments,
              level-ups, and events. Admins can issue certificates from the admin panel.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function PrepCard({ track }: { track: CertTrack }) {
  return (
    <Card
      data-testid={`prep-card-${track.id}`}
      className="p-5 border-border/40 hover:border-primary/40 transition-all"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center font-bold text-white text-lg shrink-0"
            style={{ backgroundColor: track.color }}
          >
            {track.icon}
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">
            Prep
          </Badge>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {track.providerBadge}
          </p>
          <h3 className="font-semibold text-foreground mt-0.5">{track.certName}</h3>
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
    </Card>
  )
}

function FreeCard({ track }: { track: CertTrack }) {
  return (
    <Card
      data-testid={`free-card-${track.id}`}
      className="p-5 border-border/40 hover:border-green-500/40 transition-all"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center font-bold text-white text-lg shrink-0"
            style={{ backgroundColor: track.color }}
          >
            {track.icon}
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0 text-green-500 border-green-500/40">
            Free
          </Badge>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {track.providerBadge}
          </p>
          <h3 className="font-semibold text-foreground mt-0.5">{track.certName}</h3>
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
    </Card>
  )
}