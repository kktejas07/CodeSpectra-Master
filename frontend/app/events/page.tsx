import { formatDate } from '@/lib/format-datetime'
import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, CalendarDays, ArrowRight, Code, Timer } from 'lucide-react'
import { PageHero, btnPrimary } from '@/components/landing/page-hero'
import { ThemeIllustration } from '@/components/landing/theme-illustration'

export const metadata: Metadata = {
  title: 'Events — CodeSpectra',
  description: 'Browse hackathons, codeathons, and coding competitions on CodeSpectra.',
}

async function getEvents() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/public/events`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.items || []
  } catch {
    return []
  }
}

function EventCard({ event }: { event: any }) {
  const now = Date.now()
  const starts = new Date(event.starts_at).getTime()
  const ends = new Date(event.ends_at).getTime()
  const isLive = now >= starts && now <= ends
  const isClosed = now > ends || event.status === 'closed'
  const isUpcoming = now < starts

  const statusColor = isLive ? 'bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400'
    : isClosed ? 'bg-muted text-muted-foreground'
    : 'bg-cs-accent/10 text-cs-accent-text border-cs-accent/30'
  const statusLabel = isLive ? 'Live Now' : isClosed ? 'Ended' : 'Upcoming'

  const detailUrl = event.type === 'hackathon'
    ? `/hackathons/${event.slug}`
    : `/dashboard/codeathons/${event.id}`

  return (
    <Card className="group overflow-hidden rounded-3xl border-cs-grid bg-cs-sheet py-0 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0">
      {event.banner_url && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          <img src={event.banner_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        </div>
      )}
      <div className="space-y-3 p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge>
              <Badge variant="secondary" className="text-[10px]">
                {event.type === 'hackathon' ? <Trophy className="w-2.5 h-2.5 mr-1" /> : <Code className="w-2.5 h-2.5 mr-1" />}
                {event.type === 'hackathon' ? 'Hackathon' : 'Codeathon'}
              </Badge>
            </div>
            <h3 className="truncate text-base font-bold text-cs-ink">{event.title}</h3>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {formatDate(event.starts_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.duration}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {event.participants} participants
          </span>
        </div>

        {isLive && (
          <div className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
            <Timer className="w-3 h-3" /> Live — join now!
          </div>
        )}

        <Link href={detailUrl}>
          <Button size="sm" variant={isLive ? 'default' : 'outline'} className="w-full gap-1.5 text-xs">
            {isLive ? 'Join Event' : isClosed ? 'View Results' : 'Learn More'}
            <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}

export default async function PublicEventsPage() {
  const events = await getEvents()

  return (
    <PublicPageWrapper>
      <PageHero
        title="Events"
        lead="Hackathons, codeathons and coding competitions on CodeSpectra. Join one live, or browse results from past events."
        art={<ThemeIllustration name="binary-brackets" alt="" width={360} height={240} priority className="w-full" />}
      />

      <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 lg:px-8">
        {events.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-cs-grid bg-cs-sheet p-10 text-center">
            <ThemeIllustration name="hackathon-team" alt="" width={420} height={210} className="mx-auto w-64" />
            <h2 className="cs-heading mt-6 text-3xl">No events open right now</h2>
            <p className="mt-2 text-cs-ink-soft">Create a free account to see new events on your dashboard as soon as they’re announced.</p>
            <Link href="/auth/signup" className={`${btnPrimary} mt-6`}>Create a free account</Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event: any) => (
              <EventCard key={`${event.type}-${event.id}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </PublicPageWrapper>
  )
}
