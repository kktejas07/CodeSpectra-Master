import { mockTestQuery } from '@/lib/mock-tests'

/** "12 min 5 s"; em dash while the attempt is still open. */
export function formatDuration(sec: number | null): string {
  if (sec === null) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}

/** Take-page URL that resumes an open attempt (the generate API hands back the same session). */
export function resumeHref(a: { company: string; role: string; difficulty: string }): string {
  const slug = `${a.company} ${a.role}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'test'
  const qs = new URLSearchParams(mockTestQuery(a.company, a.role))
  qs.set('difficulty', a.difficulty)
  return `/dashboard/mock-tests/${slug}/take?${qs.toString()}`
}
