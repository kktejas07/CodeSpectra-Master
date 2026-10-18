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
  /** Stable UID so re-importing updates instead of duplicating. */
  uid?: string
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

/** RFC 5545 TEXT escaping: backslash, comma, semicolon, newlines (CRLF, CR or LF). */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/**
 * RFC 5545 §3.1 line folding: content lines are at most 75 octets; longer
 * lines continue on the next line after CRLF + one space. Never splits a
 * multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (curBytes + b > limit) {
      parts.push(cur)
      cur = ''
      curBytes = 0
      limit = 74 // continuation lines carry a leading space
    }
    cur += ch
    curBytes += b
  }
  if (cur) parts.push(cur)
  return parts.join('\r\n ')
}

/** URI values are not TEXT-escaped, but control characters are never allowed. */
function cleanUri(u: string): string {
  return u.replace(/[\u0000-\u001f\u007f]/g, '')
}

export function buildIcs(events: CalendarEvent[], calendarName = 'CodeSpectra'): string {
  const now = toIcsUtc(new Date())
  const blocks = events.map((ev, i) => {
    const start = new Date(ev.start)
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000)
    const uid = ev.uid ? ev.uid.replace(/[^A-Za-z0-9@._:-]/g, '-') : `cs-${Date.now()}-${i}@codespectra.ai`
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
    if (ev.url) lines.push(`URL:${cleanUri(ev.url)}`)
    lines.push('END:VEVENT')
    return lines.map(foldLine).join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CodeSpectra//Courses//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    ...blocks,
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
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
    details: [ev.description, ev.url].filter(Boolean).join('\n\n'),
    location: ev.location || '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
