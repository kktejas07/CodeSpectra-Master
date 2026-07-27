export function toZonedDatetimeString(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(' ', 'T')
}

export function fromZonedDatetimeString(value: string, tz: string): string {
  const [datePart, timePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, min] = timePart.split(':').map(Number)
  const utcMs = Date.UTC(y, m - 1, d, h, min)
  const date = new Date(utcMs)
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC', hour12: false })
  const tzStr = date.toLocaleString('en-US', { timeZone: tz, hour12: false })
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime()
  const corrected = utcMs - offsetMs
  return new Date(corrected).toISOString()
}

/** Kept for backward compatibility — uses browser local timezone */
export function toLocalDatetimeString(d: Date): string {
  return toZonedDatetimeString(d, Intl.DateTimeFormat().resolvedOptions().timeZone)
}