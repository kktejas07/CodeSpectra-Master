/**
 * Learner-tab clients: home stats, courses, assessments, leaderboard.
 * Shapes mirror the web API responses (verified against the route files).
 */
import { api } from './client'

// ── Home ──────────────────────────────────────────────────────────────────
export interface UserStats {
  scans?: number
  reviews?: number
  fixes?: number
  integrations?: number
  challenges?: number
  submissions?: number
  dailyChallenges?: number
  streak?: number
  memberSince?: string | null
}

export async function getStats(): Promise<UserStats> {
  return api.get<UserStats>('/api/user/stats')
}

// ── Courses ───────────────────────────────────────────────────────────────
export interface CourseSummary {
  id: string
  title: string
  description?: string
  level?: string
  subject?: string
  industry?: string
  sessions?: number
  enrolled?: number
  estimatedHours?: number
  tags?: string[]
  sections?: Array<{ id?: string; title?: string; lessons?: unknown[] }>
  modules?: Array<{ id?: string; title?: string; lessons?: unknown[] }>
}

export interface CourseDetail extends CourseSummary {
  lessons?: Array<{ id?: string; title?: string; duration?: number; videoUrl?: string }>
}

function lessonCount(c: CourseSummary): number {
  const sections = c.sections ?? c.modules ?? []
  return sections.reduce((n, s) => n + (Array.isArray(s.lessons) ? s.lessons.length : 0), 0)
}

export { lessonCount }

export async function listCourses(): Promise<CourseSummary[]> {
  const res = await api.get<{ data?: CourseSummary[] }>('/api/courses')
  return Array.isArray(res.data) ? res.data : []
}

export async function getCourse(id: string): Promise<CourseDetail> {
  return api.get<CourseDetail>(`/api/courses/${encodeURIComponent(id)}`)
}

// ── Assessments ───────────────────────────────────────────────────────────
export interface AssessmentAttempt {
  examId?: string
  examTitle?: string
  title?: string
  score?: number
  passed?: boolean
  status?: string
  submittedAt?: string
  certificateId?: string | null
}

export interface AssessmentAvailable {
  id: string
  title: string
  level?: string
  subject?: string
  duration?: number
  questions?: number
  target_url?: string
  inviteToken?: string
}

export interface AssessmentsResponse {
  attempts: AssessmentAttempt[]
  available: AssessmentAvailable[]
  stats?: { total?: number; passed?: number; avgScore?: number }
}

export async function listAssessments(): Promise<AssessmentsResponse> {
  const res = await api.get<Partial<AssessmentsResponse>>('/api/user/assessments')
  return {
    attempts: Array.isArray(res.attempts) ? res.attempts : [],
    available: Array.isArray(res.available) ? res.available : [],
    stats: res.stats ?? {},
  }
}

// ── Leaderboard ───────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  title?: string
  level?: number
  xp?: number
  avatar?: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  currentUser?: { points?: number; rank?: number | null }
}

export async function getLeaderboard(): Promise<LeaderboardResponse> {
  const res = await api.get<Partial<LeaderboardResponse>>('/api/leaderboard')
  return {
    entries: Array.isArray(res.entries) ? res.entries : [],
    currentUser: res.currentUser ?? {},
  }
}
