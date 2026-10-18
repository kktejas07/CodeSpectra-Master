/**
 * Codeathons: create + results release. Extracted from
 * app/api/codeathons/route.ts (POST) and app/api/codeathons/[id]/release
 * (GET preview / POST release) — routes and the admin agent call these.
 */
import 'server-only'
import { knowledgeOnEventChange } from '@/lib/rag/hooks'
import { getMongoDb } from '@/lib/mongodb'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'
import { isTenantStaff } from '@/lib/exam-access'
import { nowIso } from '@/lib/db/ids'
import { releaseWarnings, sanitizeCertificatePolicy, DEFAULT_CERTIFICATE_POLICY } from '@/lib/codeathon-results'
import {
  buildCodeathonStandings, codeathonResults, finalizeCodeathonRelease, type CodeathonResultsDoc,
} from '@/lib/codeathon-release'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

/** Create a codeathon (POST /api/codeathons). */
export async function createCodeathon(user: ServiceUser, body: Record<string, any>): Promise<ServiceResult<Record<string, unknown>>> {
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') return fail(403, 'Forbidden')
  // A company admin without an organization would create an unowned (platform) event.
  if (user.role === 'tenant_admin' && !user.tenantId) return fail(403, 'Forbidden')
  const db = await getMongoDb()
  const now = new Date().toISOString()
  const doc = {
    id: crypto.randomUUID(),
    title: body.title,
    description: body.description || '',
    difficulty: body.difficulty || 'Medium',
    topics: body.topics || [],
    rules: body.rules || '',
    maxParticipants: body.maxParticipants || 0,
    startDate: body.startDate || '',
    endDate: body.endDate || '',
    status: body.status || 'upcoming',
    participants: 0,
    prizePool: body.prizePool || '',
    cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
    problems: body.problems || [],
    // New fields for team/individual mode
    event_type: body.event_type || 'individual', // 'individual' | 'team'
    team_size_min: body.team_size_min || 1,
    team_size_max: body.team_size_max || 1,
    problem_visibility: body.problem_visibility || 'during_contest', // 'during_contest' | 'after_start' | 'immediate'
    tenant_id: user.tenantId || null,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection('codeathons').insertOne(doc)
  knowledgeOnEventChange('codeathon', doc.id, doc.tenant_id)
  return ok(doc as Record<string, unknown>, 201)
}

async function loadStaffCodeathon(user: ServiceUser, id: string): Promise<ServiceResult<Record<string, unknown>>> {
  const db = await getMongoDb()
  const codeathon = await db.collection('codeathons').findOne({ id }, { projection: { _id: 0 } })
  if (!codeathon) return fail(404, 'Codeathon not found')
  if (!isTenantStaff(user, codeathon as Record<string, unknown>)) return fail(403, 'Forbidden')
  return ok(codeathon as Record<string, unknown>)
}

/** GET /api/codeathons/[id]/release — final standings as they would be released (reads only). */
export async function previewCodeathonRelease(user: ServiceUser, id: string): Promise<ServiceResult<Record<string, unknown>>> {
  const loaded = await loadStaffCodeathon(user, id)
  if (!loaded.ok) return loaded
  const codeathon = loaded.data
  const db = await getMongoDb()
  const policy = sanitizeCertificatePolicy(codeathon.certificate_policy ?? DEFAULT_CERTIFICATE_POLICY)
  if (codeathon.results_released === true) {
    const snap = await (await codeathonResults(db)).findOne({ codeathon_id: String(codeathon.id) }, { projection: { _id: 0 } })
    return ok({
      released: true,
      released_at: codeathon.released_at || snap?.released_at || null,
      certificate_policy: snap?.certificate_policy || policy,
      standings: snap?.standings || [],
      ranked_count: snap?.ranked_count ?? 0,
      participant_count: snap?.participant_count ?? 0,
      snapshot_missing: !snap,
      warnings: [],
    })
  }
  const built = await buildCodeathonStandings(db, codeathon)
  return ok({
    released: false,
    ended: built.ended,
    unscored: built.unscored,
    event_type: built.teamMode ? 'team' : 'individual',
    certificate_policy: policy,
    standings: built.standings,
    ranked_count: built.standings.filter((s) => s.rank !== null).length,
    participant_count: built.standings.length,
    warnings: releaseWarnings({ ended: built.ended, unscored: built.unscored, entrants: built.standings.length }),
  })
}

export function snapshotDoc(
  codeathon: Record<string, unknown>,
  standings: CodeathonResultsDoc['standings'],
  teamMode: boolean,
  releasedBy: string,
  releasedAt: string,
  policy: CodeathonResultsDoc['certificate_policy'],
): CodeathonResultsDoc {
  return {
    codeathon_id: String(codeathon.id),
    tenant_id: typeof codeathon.tenant_id === 'string' ? codeathon.tenant_id : null,
    title: String(codeathon.title || 'Codeathon'),
    event_type: teamMode ? 'team' : 'individual',
    released_at: releasedAt,
    released_by: releasedBy,
    certificate_policy: policy,
    ranked_count: standings.filter((s) => s.rank !== null).length,
    participant_count: standings.length,
    standings,
  }
}

/** POST /api/codeathons/[id]/release — release (or { reissue: true } on a released codeathon). */
export async function releaseCodeathonResults(
  user: ServiceUser,
  id: string,
  body: { force?: unknown; reissue?: unknown; certificate_policy?: unknown },
): Promise<ServiceResult<Record<string, unknown>>> {
  const loaded = await loadStaffCodeathon(user, id)
  if (!loaded.ok) return loaded
  const codeathon = loaded.data
  const db = await getMongoDb()
  const col = db.collection('codeathons')
  const resultsCol = await codeathonResults(db)

  // ── Re-issue from the frozen snapshot ──
  if (codeathon.results_released === true) {
    if (body.reissue !== true) {
      return fail(409, 'Results are already released', { error: 'Results are already released', code: 'already_released' })
    }
    let snap = await resultsCol.findOne({ codeathon_id: id }, { projection: { _id: 0 } })
    if (!snap) {
      // A release that stopped before writing its snapshot: inputs are frozen
      // (submit and review are locked once released), so rebuild it once.
      const built = await buildCodeathonStandings(db, codeathon)
      const doc = snapshotDoc(codeathon, built.standings, built.teamMode, String(codeathon.released_by || user.id),
        String(codeathon.released_at || nowIso()), sanitizeCertificatePolicy(codeathon.certificate_policy))
      await resultsCol.updateOne({ codeathon_id: id }, { $setOnInsert: doc }, { upsert: true })
      snap = await resultsCol.findOne({ codeathon_id: id }, { projection: { _id: 0 } })
    }
    if (!snap) return fail(500, 'Could not load the released results')
    const counts = await finalizeCodeathonRelease(snap, codeathon, { notifyAll: false })
    return ok({ ok: true, reissued: true, released_at: snap.released_at, ...counts })
  }

  const policy = sanitizeCertificatePolicy(body.certificate_policy ?? codeathon.certificate_policy ?? DEFAULT_CERTIFICATE_POLICY)
  const built = await buildCodeathonStandings(db, codeathon)
  const warnings = releaseWarnings({ ended: built.ended, unscored: built.unscored, entrants: built.standings.length })
  if (built.standings.length === 0) {
    return fail(409, warnings[warnings.length - 1], { error: warnings[warnings.length - 1], code: 'nothing_to_release', warnings })
  }
  if (warnings.length > 0 && body.force !== true) {
    return fail(409, warnings.join(' '), { error: warnings.join(' '), code: 'confirm_release', warnings, unscored: built.unscored })
  }

  // Claim the release atomically — a concurrent second click gets 409.
  const now = nowIso()
  const claim = await col.updateOne(
    { id, results_released: { $ne: true } },
    {
      $set: {
        results_released: true,
        released_at: now,
        released_by: user.id,
        certificate_policy: policy,
        status: 'completed',
        updated_at: now,
      },
    },
  )
  if (claim.modifiedCount === 0) {
    return fail(409, 'Results are already released', { error: 'Results are already released', code: 'already_released' })
  }

  const doc = snapshotDoc(codeathon, built.standings, built.teamMode, user.id, now, policy)
  await resultsCol.updateOne({ codeathon_id: id }, { $setOnInsert: doc }, { upsert: true })
  const snap = (await resultsCol.findOne({ codeathon_id: id }, { projection: { _id: 0 } })) || doc
  const counts = await finalizeCodeathonRelease(snap, { ...codeathon, released_at: now }, { notifyAll: true })

  return ok({ ok: true, released_at: now, certificate_policy: policy, ...counts })
}

// ─── Problems from the library (same mapping as the admin page's "import") ──

export interface CodeathonProblem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
  description: string
  input_format?: string
  output_format?: string
  sample_input: string
  sample_output: string
  test_cases: Array<{ input: string; expected: string; hidden: boolean }>
  source_problem?: string
}

/** Test cases a codeathon grades with (drops cases with no expected output). */
export function toCodeathonTests(raw: unknown): CodeathonProblem['test_cases'] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => !!t)
    .map((t) => ({
      input: String(t.input ?? t.stdin ?? ''),
      expected: String(t.expected ?? t.expected_stdout ?? ''),
      hidden: t.hidden === true || t.is_sample === false,
    }))
    .filter((t) => t.expected.trim().length > 0)
}

/** A library problem as a codeathon problem; null when it has no gradable tests. */
export function codeathonProblemFromLibrary(p: Record<string, unknown>, points?: number): CodeathonProblem | null {
  const diff = String(p.difficulty || '').toLowerCase()
  const difficulty = (diff === 'hard' ? 'Hard' : diff === 'easy' ? 'Easy' : 'Medium') as CodeathonProblem['difficulty']
  const tests = toCodeathonTests(p.test_cases)
  if (tests.length === 0) return null
  const sample = tests.find((t) => !t.hidden)
  return {
    id: crypto.randomUUID(),
    title: String(p.title || 'Problem'),
    difficulty,
    points: points ?? (difficulty === 'Easy' ? 50 : difficulty === 'Hard' ? 200 : 100),
    description: String(p.statement_md || p.description || 'Solve the algorithmic challenge according to specification.'),
    ...(typeof p.input_format === 'string' ? { input_format: p.input_format } : {}),
    ...(typeof p.output_format === 'string' ? { output_format: p.output_format } : {}),
    sample_input: sample?.input || '',
    sample_output: sample?.expected || '',
    test_cases: tests,
    ...(typeof p.slug === 'string' ? { source_problem: p.slug } : {}),
  }
}
