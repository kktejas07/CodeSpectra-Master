'use client'

import { useEffect, useState } from 'react'
import { CalendarPlus, Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { addToCalendarLinks, type FeedSource } from '@/lib/calendar/feed'

type Props = {
  kind: FeedSource
  /** Hackathon id or slug, or codeathon id. */
  id: string
  title: string
  start: string
  end?: string | null
  description?: string
  /** Path of the detail page, e.g. /hackathons/my-event */
  path: string
  /** Hide for drafts: the public .ics route only serves published events. */
  status?: string
  size?: 'sm' | 'default'
  className?: string
}

/**
 * "Add to calendar" for one hackathon / codeathon: a server-built .ics
 * download (works signed out, published events only) and a Google Calendar link.
 */
export function AddEventToCalendar({ kind, id, title, start, end, description, path, status, size = 'sm', className }: Props) {
  // Origin is read after mount so server and client markup match.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  if (!id || !start || status === 'draft' || !Number.isFinite(new Date(start).getTime())) return null
  const url = `${origin}${path}`
  const { icsHref, googleHref } = addToCalendarLinks(kind, id, {
    title,
    start,
    end: end || undefined,
    description: (description || '').slice(0, 500),
    url,
    location: 'CodeSpectra (online)',
  })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className}>
          <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden /> Add to calendar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={icsHref} download>
            <Download className="mr-2 h-4 w-4" aria-hidden /> Download .ics file
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={googleHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden /> Google Calendar
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
