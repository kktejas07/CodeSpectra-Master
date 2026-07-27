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
  const refUtc = Date.UTC(y, m - 1, d, h, min)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  })
  const parts = fmt.formatToParts(new Date(refUtc))
  const gp = (type: string) => Number(parts.find(p => p.type === type)?.value || '0')
  let offsetMin = (gp('hour') * 60 + gp('minute')) - (h * 60 + min)
  while (offsetMin > 720) offsetMin -= 1440
  while (offsetMin < -720) offsetMin += 1440
  return new Date(refUtc - offsetMin * 60 * 1000).toISOString()
}

export function toLocalDatetimeString(d: Date): string {
  return toZonedDatetimeString(d, Intl.DateTimeFormat().resolvedOptions().timeZone)
}
