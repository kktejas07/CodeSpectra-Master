/**
 * Google Classroom — pure request builders and grade mapping
 * (tests/integrations-classroom.test.ts).
 */

export const CLASSROOM_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.coursework.students',
]

export const CLASSROOM_API = 'https://classroom.googleapis.com/v1'

export interface OAuthApp { client_id: string; client_secret: string }

export function classroomAuthUrl(app: OAuthApp, redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: app.client_id, redirect_uri: redirect, response_type: 'code', scope: CLASSROOM_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

/** Our 0–100 result → Classroom points (2 decimals, within 0..maxPoints). */
export function gradeFor(percent: number, maxPoints: number): number {
  if (!Number.isFinite(percent) || !(maxPoints > 0)) return 0
  const p = Math.max(0, Math.min(100, percent))
  return Math.round((p / 100) * maxPoints * 100) / 100
}

/** Released submissions → best percentage per lower-cased email. */
export function bestPercentByEmail(subs: { email?: unknown; score?: unknown; max_score?: unknown; score_released?: unknown }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of subs) {
    if (s.score_released !== true || typeof s.email !== 'string') continue
    const score = Number(s.score)
    const max = Number(s.max_score)
    if (!Number.isFinite(score) || !(max > 0)) continue
    const pct = Math.max(0, Math.min(100, (score / max) * 100))
    const e = s.email.trim().toLowerCase()
    if (pct > (out.get(e) ?? -1)) out.set(e, Math.round(pct * 100) / 100)
  }
  return out
}

/** Classroom due date / time (UTC) from an ISO instant. */
export function dueFields(iso: string | null | undefined): { dueDate: { year: number; month: number; day: number }; dueTime: { hours: number; minutes: number } } | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null
  const d = new Date(iso)
  return { dueDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, dueTime: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() } }
}

export function courseWorkBody(p: { title: string; description: string; url: string; maxPoints: number; due?: string | null }) {
  return {
    title: p.title.slice(0, 300),
    description: p.description.slice(0, 2000),
    materials: [{ link: { url: p.url } }],
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
    maxPoints: p.maxPoints,
    ...(dueFields(p.due) || {}),
  }
}

/** Grades to write: one PATCH per student submission whose student has a released result. */
export function gradePatches(p: {
  submissions: { id: string; userId: string; assignedGrade?: number | null }[]
  rosterEmails: Map<string, string>
  percents: Map<string, number>
  maxPoints: number
}): { submissionId: string; grade: number }[] {
  const out: { submissionId: string; grade: number }[] = []
  for (const s of p.submissions) {
    const email = p.rosterEmails.get(s.userId)
    if (!email) continue
    const pct = p.percents.get(email)
    if (pct === undefined) continue
    const grade = gradeFor(pct, p.maxPoints)
    if (s.assignedGrade === grade) continue
    out.push({ submissionId: s.id, grade })
  }
  return out
}
