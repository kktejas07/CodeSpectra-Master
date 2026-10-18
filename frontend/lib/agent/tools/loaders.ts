/**
 * Tenant-checked loaders shared by read and write tools. Every load re-checks
 * the caller against the record's tenant_id (superadmin: any).
 */
import { getMongoDb } from '@/lib/mongodb'
import type { AgentCaller } from '@/lib/agent/contract'
import { resolveSections } from '@/lib/exam-sections'
import { assertCanManage } from './scope'

type Doc = Record<string, any>

export async function loadExam(caller: AgentCaller, id: string): Promise<Doc> {
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id }, { projection: { _id: 0 } }) as Doc | null
  assertCanManage(caller, exam, 'Test')
  return exam as Doc
}

export async function loadHackathon(caller: AgentCaller, idOrSlug: string): Promise<Doc> {
  const db = await getMongoDb()
  const hk = await db.collection('hackathons').findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] }, { projection: { _id: 0 } }) as Doc | null
  assertCanManage(caller, hk, 'Hackathon')
  return hk as Doc
}

export async function loadCodeathon(caller: AgentCaller, id: string): Promise<Doc> {
  const db = await getMongoDb()
  const c = await db.collection('codeathons').findOne({ id }, { projection: { _id: 0 } }) as Doc | null
  assertCanManage(caller, c, 'Codeathon')
  return c as Doc
}

export const testLink = (id: string) => `/dashboard/admin/assessments/${id}`
export const testResultsLink = (id: string) => `/dashboard/admin/assessments/${id}/results`
export const hackathonLink = (id: string) => `/dashboard/admin/hackathons/${id}`
export const codeathonLink = () => `/dashboard/admin/codeathons`
export const problemLink = (slug: string) => `/dashboard/problems/${slug}`

/** Questions grouped by section with points / difficulty — no prompts' answers, no keys. */
export function questionOutline(exam: Doc, opts: { promptChars?: number } = {}): Array<Record<string, unknown>> {
  const list = (Array.isArray(exam.questionList) ? exam.questionList : []) as Doc[]
  const sections = resolveSections(exam)
  const byId = new Map(list.map((q) => [String(q.id), q]))
  const row = (q: Doc) => ({
    id: String(q.id),
    type: String(q.type || 'mcq'),
    title: String(q.title || '').slice(0, 120),
    ...(opts.promptChars ? { prompt: String(q.prompt || q.question || '').replace(/\s+/g, ' ').slice(0, opts.promptChars) } : {}),
    points: Number(q.score ?? q.points) || 0,
    ...(q.difficulty ? { difficulty: String(q.difficulty) } : {}),
  })
  if (sections.length === 0) {
    return [{ section: null, title: 'All questions', questions: list.map(row), points: list.reduce((a, q) => a + (Number(q.score ?? q.points) || 0), 0) }]
  }
  return sections.map((s) => {
    const qs = s.question_ids.map((qid) => byId.get(qid)).filter(Boolean) as Doc[]
    return {
      section: s.id,
      title: s.title,
      time_limit_minutes: s.time_limit_minutes,
      lock_after_leave: s.lock_after_leave,
      questions: qs.map(row),
      points: qs.reduce((a, q) => a + (Number(q.score ?? q.points) || 0), 0),
    }
  })
}
