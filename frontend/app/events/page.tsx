import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, CalendarDays, ArrowRight, Code, Timer } from 'lucide-react'

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

  const statusColor = isLive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    : isClosed ? 'bg-muted text-muted-foreground'
    : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
  const statusLabel = isLive ? 'Live Now' : isClosed ? 'Ended' : 'Upcoming'

  const detailUrl = event.type === 'hackathon'
    ? `/hackathons/${event.slug}`
    : `/dashboard/codeathons/${event.id}`

  return (
    <Card className="overflow-hidden hover:border-primary/40 transition-colors group">
      {event.banner_url && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          <img src={event.banner_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge>
              <Badge variant="secondary" className="text-[10px]">
                {event.type === 'hackathon' ? <Trophy className="w-2.5 h-2.5 mr-1" /> : <Code className="w-2.5 h-2.5 mr-1" />}
                {event.type === 'hackathon' ? 'Hackathon' : 'Codeathon'}
              </Badge>
            </div>
            <h3 className="font-semibold text-sm truncate">{event.title}</h3>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {new Date(event.starts_at).toLocaleDateString()}
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
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
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
      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Hackathons, codeathons, and coding competitions</p>
        </div>

        {events.length === 0 ? (
          <Card className="p-8 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No events available yet</p>
            <Link href="/auth/signup">
              <Button size="sm" className="mt-4">Sign up to get notified</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event: any) => (
              <EventCard key={`${event.type}-${event.id}`} event={event} />
            ))}
          </div>
        )}
      </main>
    </PublicPageWrapper>
  )
}
