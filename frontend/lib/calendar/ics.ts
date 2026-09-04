/**
 * Build a minimal RFC 5545 .ics calendar file (Google / Apple / Outlook).
 * Unstop-style “Add to calendar” for course deadlines / learning reminders.
 */
export type CalendarEvent = {
  title: string
  description?: string
  location?: string
  /** ISO start */
  start: string | Date
  /** ISO end — defaults to start + 1 hour */
  end?: string | Date
  url?: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Format as UTC TIMESTAMP: 20260904T183000Z */
export function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function buildIcs(events: CalendarEvent[], calendarName = 'CodeSpectra'): string {
  const now = toIcsUtc(new Date())
  const blocks = events.map((ev, i) => {
    const start = new Date(ev.start)
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000)
    const uid = `cs-${Date.now()}-${i}@codespectra.ai`
    const lines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsUtc(start)}`,
      `DTEND:${toIcsUtc(end)}`,
      `SUMMARY:${escapeText(ev.title)}`,
    ]
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`)
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`)
    if (ev.url) lines.push(`URL:${ev.url}`)
    lines.push('END:VEVENT')
    return lines.join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CodeSpectra//Courses//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...blocks,
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Trigger a browser download of an .ics file. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Google Calendar “template” URL for a single event (opens in new tab). */
export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = new Date(ev.start)
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000)
  const fmt = (d: Date) =>
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: ev.description || '',
    location: ev.location || '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
