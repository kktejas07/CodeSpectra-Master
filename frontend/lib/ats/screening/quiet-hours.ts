/**
 * Outreach window: messages and calls only between `start` and `end` (default
 * 9:00–20:00) in the candidate's local time. Countries spanning several zones
 * must be inside the window in every listed zone (conservative).
 */
const COUNTRY_TZ: Record<string, string[]> = {
  IN: ['Asia/Kolkata'], US: ['America/New_York', 'America/Los_Angeles'], CA: ['America/Toronto', 'America/Vancouver'],
  GB: ['Europe/London'], IE: ['Europe/Dublin'], AE: ['Asia/Dubai'], SA: ['Asia/Riyadh'], QA: ['Asia/Qatar'],
  KW: ['Asia/Kuwait'], OM: ['Asia/Muscat'], BH: ['Asia/Bahrain'], SG: ['Asia/Singapore'], MY: ['Asia/Kuala_Lumpur'],
  AU: ['Australia/Sydney', 'Australia/Perth'], NZ: ['Pacific/Auckland'], DE: ['Europe/Berlin'], FR: ['Europe/Paris'],
  NL: ['Europe/Amsterdam'], ES: ['Europe/Madrid'], IT: ['Europe/Rome'], CH: ['Europe/Zurich'], SE: ['Europe/Stockholm'],
  PL: ['Europe/Warsaw'], PT: ['Europe/Lisbon'], BE: ['Europe/Brussels'], AT: ['Europe/Vienna'], DK: ['Europe/Copenhagen'],
  NO: ['Europe/Oslo'], FI: ['Europe/Helsinki'], PK: ['Asia/Karachi'], BD: ['Asia/Dhaka'], LK: ['Asia/Colombo'],
  NP: ['Asia/Kathmandu'], PH: ['Asia/Manila'], ID: ['Asia/Jakarta'], TH: ['Asia/Bangkok'], VN: ['Asia/Ho_Chi_Minh'],
  JP: ['Asia/Tokyo'], KR: ['Asia/Seoul'], CN: ['Asia/Shanghai'], HK: ['Asia/Hong_Kong'], TW: ['Asia/Taipei'],
  ZA: ['Africa/Johannesburg'], NG: ['Africa/Lagos'], KE: ['Africa/Nairobi'], EG: ['Africa/Cairo'], IL: ['Asia/Jerusalem'],
  TR: ['Europe/Istanbul'], BR: ['America/Sao_Paulo'], MX: ['America/Mexico_City'], AR: ['America/Argentina/Buenos_Aires'],
}

export const DEFAULT_QUIET_HOURS = { start: 9, end: 20 }

export function timezonesFor(country: string | null | undefined): string[] {
  return COUNTRY_TZ[(country || '').toUpperCase()] || ['UTC']
}

/** Local time of day in minutes (0–1439) for `tz` at `at`. */
function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return h * 60 + m
}

export function isWithinOutreachWindow(
  at: Date,
  country: string | null | undefined,
  window: { start: number; end: number } = DEFAULT_QUIET_HOURS,
): boolean {
  return timezonesFor(country).every((tz) => {
    const m = localMinutes(at, tz)
    return m >= window.start * 60 && m < window.end * 60
  })
}

/** First instant ≥ `from` inside the window (15-min steps, up to 3 days; null if none, e.g. no overlap). */
export function nextOutreachTime(
  from: Date,
  country: string | null | undefined,
  window: { start: number; end: number } = DEFAULT_QUIET_HOURS,
): Date | null {
  if (isWithinOutreachWindow(from, country, window)) return from
  const step = 15 * 60_000
  let t = Math.ceil(from.getTime() / step) * step
  for (let i = 0; i < 4 * 24 * 3; i++, t += step) {
    const d = new Date(t)
    if (isWithinOutreachWindow(d, country, window)) return d
  }
  return null
}
