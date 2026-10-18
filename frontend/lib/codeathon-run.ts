import { executeOnce } from '@/lib/piston'

/**
 * Run a codeathon solution in the shared execution backend (Piston, or the
 * dev-only local executor that lib/piston.ts gates off in production).
 *
 * Replaces the old `child_process.exec` heredoc runner, which executed
 * participant code directly on the app server and could be broken out of
 * with a line reading `EOF`.
 */
export async function runCodeathonCode(
  code: string,
  language: string,
  input: string,
): Promise<{ output: string; error: string; exitCode: number }> {
  const lang = language === 'cpp' ? 'c++' : language
  try {
    const r = await executeOnce({ language: lang, source: String(code ?? ''), stdin: String(input ?? ''), timeoutMs: 10000 })
    if (r.compile && r.compile.code) {
      return { output: '', error: (r.compile.output || r.compile.stderr || 'Compilation failed').trim(), exitCode: r.compile.code }
    }
    return { output: (r.run.stdout || '').trim(), error: (r.run.stderr || '').trim(), exitCode: r.run.code ?? 1 }
  } catch (e) {
    return { output: '', error: e instanceof Error ? e.message : 'Execution failed', exitCode: 1 }
  }
}

// ─── Shared codeathon rules (pure helpers + small DB helpers) ────────────────

/** Compare program output with the expected output, ignoring surrounding whitespace and CRLF. */
export function outputsMatch(actual: unknown, expected: unknown): boolean {
  const norm = (v: unknown) => String(v ?? '').replace(/\r\n/g, '\n').trim()
  return norm(actual) === norm(expected)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CodeathonLike = Record<string, any>

export function codeathonWindow(doc: CodeathonLike, now = Date.now()): { started: boolean; ended: boolean } {
  const start = doc.startDate ? new Date(String(doc.startDate)).getTime() : NaN
  const end = doc.endDate ? new Date(String(doc.endDate)).getTime() : NaN
  const started = doc.status === 'active' || doc.status === 'live' || (Number.isFinite(start) && now >= start)
  const ended = doc.status === 'completed' || doc.status === 'archived' || (Number.isFinite(end) && now > end)
  return { started, ended }
}

/** Same rule as GET /api/codeathons/[id]/problems: 'during_contest' (default) hides problems before start. */
export function codeathonProblemsVisible(doc: CodeathonLike, now = Date.now()): boolean {
  const visibility = doc.problem_visibility || 'during_contest'
  if (visibility !== 'during_contest') return true
  return codeathonWindow(doc, now).started
}

/** Best score per problem, summed (pure; lives in codeathon-results so client code can use it). */
export { bestScoreTotals } from '@/lib/codeathon-results'
import { bestScoreTotals } from '@/lib/codeathon-results'

type Db = import('mongodb').Db

/** Registered, or (team mode) on a team. */
export async function isCodeathonParticipant(db: Db, codeathon: CodeathonLike, userId: string): Promise<boolean> {
  const id = String(codeathon.id || '')
  const reg = await db.collection('codeathon_registrations').findOne({ codeathon_id: id, user_id: userId }, { projection: { _id: 1 } })
  if (reg) return true
  const member = await db.collection('codeathon_team_members').findOne({ codeathon_id: id, user_id: userId }, { projection: { _id: 1 } })
  return !!member
}

/** Rebuild a leaderboard row from submissions (user row, and team row when teamId is given). */
export async function recomputeCodeathonStanding(
  db: Db,
  codeathonId: string,
  who: { userId?: string | null; userName?: string; teamId?: string | null; teamName?: string },
): Promise<void> {
  const now = new Date().toISOString()
  if (who.userId) {
    const subs = await db.collection('codeathon_submissions')
      .find({ codeathon_id: codeathonId, user_id: who.userId }, { projection: { problem_id: 1, score: 1, status: 1 } }).toArray()
    const t = bestScoreTotals(subs)
    await db.collection('codeathon_leaderboard').updateOne(
      { codeathon_id: codeathonId, user_id: who.userId },
      {
        $set: { total_score: t.total, problems_solved: t.solved, last_submission_at: now, ...(who.userName ? { user_name: who.userName } : {}) },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    )
  }
  if (who.teamId) {
    const subs = await db.collection('codeathon_submissions')
      .find({ codeathon_id: codeathonId, team_id: who.teamId }, { projection: { problem_id: 1, score: 1, status: 1 } }).toArray()
    const t = bestScoreTotals(subs)
    await db.collection('codeathon_leaderboard').updateOne(
      { codeathon_id: codeathonId, team_id: who.teamId },
      {
        $set: {
          total_score: t.total, problems_solved: t.solved, last_submission_at: now,
          ...(who.teamName ? { team_name: who.teamName, user_name: who.teamName } : {}),
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    )
  }
}
