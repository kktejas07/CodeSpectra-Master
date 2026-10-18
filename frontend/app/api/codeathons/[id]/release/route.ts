/**
 * /api/codeathons/[id]/release — staff only (superadmin, or the owning
 * tenant's admin; a tenant admin without a tenant owns nothing).
 *
 *   GET   → preview: final standings as they would be released, warnings
 *           (not ended / submissions still being graded), current state.
 *   POST  → release. Body: { force?: boolean, certificate_policy?: {...} }.
 *           Without force, warnings come back as 409 { code: 'confirm_release' }.
 *           On a released codeathon, { reissue: true } re-runs certificates +
 *           XP from the frozen snapshot (idempotent; notifies only new certs).
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isTenantStaff } from '@/lib/exam-access'
import { nowIso } from '@/lib/db/ids'
import {
  releaseWarnings,
  sanitizeCertificatePolicy,
  DEFAULT_CERTIFICATE_POLICY,
} from '@/lib/codeathon-results'
import {
  buildCodeathonStandings,
  codeathonResults,
  finalizeCodeathonRelease,
  type CodeathonResultsDoc,
} from '@/lib/codeathon-release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type Loaded =
  | { ok: false; res: NextResponse }
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAPIUser>>>; db: Awaited<ReturnType<typeof getMongoDb>>; codeathon: Record<string, unknown> }

async function load(ctx: Ctx): Promise<Loaded> {
  const user = await getAPIUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id } = await ctx.params
  const db = await getMongoDb()
  const codeathon = await db.collection('codeathons').findOne({ id }, { projection: { _id: 0 } })
  if (!codeathon) return { ok: false, res: NextResponse.json({ error: 'Codeathon not found' }, { status: 404 }) }
  if (!isTenantStaff(user, codeathon as Record<string, unknown>)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, user, db, codeathon: codeathon as Record<string, unknown> }
}

export async function GET(_req: Request, ctx: Ctx) {
  const r = await load(ctx)
  if (!r.ok) return r.res
  const { db, codeathon } = r
  try {
    const policy = sanitizeCertificatePolicy(codeathon.certificate_policy ?? DEFAULT_CERTIFICATE_POLICY)
    if (codeathon.results_released === true) {
      const snap = await (await codeathonResults(db)).findOne({ codeathon_id: String(codeathon.id) }, { projection: { _id: 0 } })
      return NextResponse.json({
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
    return NextResponse.json({
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
  } catch (e) {
    console.error('[codeathon release] preview failed:', e)
    return NextResponse.json({ error: 'Could not load the results preview' }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await load(ctx)
  if (!r.ok) return r.res
  const { user, db, codeathon } = r
  const body = (await req.json().catch(() => ({}))) as { force?: unknown; reissue?: unknown; certificate_policy?: unknown }
  const id = String(codeathon.id)
  const col = db.collection('codeathons')
  const resultsCol = await codeathonResults(db)

  try {
    // ── Re-issue from the frozen snapshot ──
    if (codeathon.results_released === true) {
      if (body.reissue !== true) {
        return NextResponse.json({ error: 'Results are already released', code: 'already_released' }, { status: 409 })
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
      if (!snap) return NextResponse.json({ error: 'Could not load the released results' }, { status: 500 })
      const counts = await finalizeCodeathonRelease(snap, codeathon, { notifyAll: false })
      return NextResponse.json({ ok: true, reissued: true, released_at: snap.released_at, ...counts })
    }

    const policy = sanitizeCertificatePolicy(body.certificate_policy ?? codeathon.certificate_policy ?? DEFAULT_CERTIFICATE_POLICY)
    const built = await buildCodeathonStandings(db, codeathon)
    const warnings = releaseWarnings({ ended: built.ended, unscored: built.unscored, entrants: built.standings.length })
    if (built.standings.length === 0) {
      return NextResponse.json({ error: warnings[warnings.length - 1], code: 'nothing_to_release', warnings }, { status: 409 })
    }
    if (warnings.length > 0 && body.force !== true) {
      return NextResponse.json({ error: warnings.join(' '), code: 'confirm_release', warnings, unscored: built.unscored }, { status: 409 })
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
      return NextResponse.json({ error: 'Results are already released', code: 'already_released' }, { status: 409 })
    }

    const doc = snapshotDoc(codeathon, built.standings, built.teamMode, user.id, now, policy)
    await resultsCol.updateOne({ codeathon_id: id }, { $setOnInsert: doc }, { upsert: true })
    const snap = (await resultsCol.findOne({ codeathon_id: id }, { projection: { _id: 0 } })) || doc
    const counts = await finalizeCodeathonRelease(snap, { ...codeathon, released_at: now }, { notifyAll: true })

    return NextResponse.json({ ok: true, released_at: now, certificate_policy: policy, ...counts })
  } catch (e) {
    console.error('[codeathon release] failed:', id, e)
    return NextResponse.json({ error: 'Could not release results' }, { status: 500 })
  }
}

function snapshotDoc(
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
