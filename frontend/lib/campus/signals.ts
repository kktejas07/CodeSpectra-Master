/**
 * Readiness signals for a set of students (server only): recent company-test
 * practice, adaptive tests, contest / codeathon placements and the shared
 * skill-passport level (lib/passport). Bounded reads: the last few results
 * per student, and at most MAX_USERS students per call.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { percentileFromRank, type UserSignals } from './readiness'

export const MAX_USERS = 3000
const PER_USER = 10

type Doc = Record<string, any>

function empty(): UserSignals {
  return { companyTests: [], adaptive: [], contests: [] }
}

export async function loadSignals(userIds: readonly string[]): Promise<Map<string, UserSignals>> {
  const ids = [...new Set(userIds)].slice(0, MAX_USERS)
  const out = new Map<string, UserSignals>(ids.map((id) => [id, empty()]))
  if (!ids.length) return out
  const db = await getMongoDb()
  const cap = ids.length * PER_USER

  const [attempts, adaptive, contestRows, codeathonRows, passports] = await Promise.all([
    db.collection('company_test_attempts')
      .find({ userId: { $in: ids }, status: 'completed' }, { projection: { _id: 0, userId: 1, 'result.percent': 1, 'result.passed': 1, 'result.sections.name': 1, 'result.sections.percent': 1, completedAt: 1 } })
      .sort({ completedAt: -1 }).limit(cap).toArray(),
    db.collection('exam_submissions')
      .find({ user_id: { $in: ids }, adaptive: { $exists: true } }, { projection: { _id: 0, user_id: 1, score: 1, max_score: 1, created_at: 1 } })
      .sort({ created_at: -1 }).limit(cap).toArray(),
    db.collection('contest_results').aggregate([
      { $match: { 'standings.member_ids': { $in: ids } } },
      { $project: { _id: 0, released_at: 1, ranked_count: 1, standings: { $filter: { input: '$standings', as: 's', cond: { $gt: [{ $size: { $setIntersection: ['$$s.member_ids', ids] } }, 0] } } } } },
      { $sort: { released_at: -1 } },
      { $limit: 500 },
    ]).toArray(),
    db.collection('codeathon_results').aggregate([
      { $match: { 'standings.member_ids': { $in: ids } } },
      { $project: { _id: 0, released_at: 1, ranked_count: 1, standings: { $filter: { input: '$standings', as: 's', cond: { $gt: [{ $size: { $setIntersection: ['$$s.member_ids', ids] } }, 0] } } } } },
      { $sort: { released_at: -1 } },
      { $limit: 500 },
    ]).toArray(),
    // Only passports the student chose to share (link or public).
    db.collection('skill_passports')
      .find({ user_id: { $in: ids }, visibility: { $in: ['link', 'public'] } }, { projection: { _id: 0, user_id: 1, skills_index: 1 } })
      .toArray(),
  ])

  for (const a of attempts as Doc[]) {
    const s = out.get(String(a.userId))
    if (!s || s.companyTests.length >= PER_USER || !a.result) continue
    s.companyTests.push({
      percent: Number(a.result.percent) || 0,
      passed: a.result.passed === true,
      sections: Array.isArray(a.result.sections) ? a.result.sections.map((x: Doc) => ({ name: String(x.name || ''), percent: Number(x.percent) || 0 })) : [],
    })
  }
  for (const e of adaptive as Doc[]) {
    const s = out.get(String(e.user_id))
    const max = Number(e.max_score) || 0
    if (!s || s.adaptive.length >= PER_USER || max <= 0) continue
    s.adaptive.push((Math.max(0, Number(e.score) || 0) / max) * 100)
  }
  for (const r of [...contestRows, ...codeathonRows] as Doc[]) {
    const ranked = Number(r.ranked_count) || 0
    for (const st of (r.standings || []) as Doc[]) {
      for (const m of (st.member_ids || []) as string[]) {
        const s = out.get(m)
        if (!s || s.contests.length >= PER_USER) continue
        s.contests.push(percentileFromRank(st.rank, ranked))
      }
    }
  }
  for (const p of passports as Doc[]) {
    const s = out.get(String(p.user_id))
    const ranks = (Array.isArray(p.skills_index) ? p.skills_index : [])
      .map((x: Doc) => Number(x.rank))
      .filter((n: number) => Number.isFinite(n) && n >= 0)
      .sort((a: number, b: number) => b - a)
      .slice(0, 3)
    if (s && ranks.length) s.passportLevel = Math.round((ranks.reduce((t: number, n: number) => t + n, 0) / ranks.length + 1) * 10) / 10
  }
  return out
}
