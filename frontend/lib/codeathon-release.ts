/**
 * Codeathon results release — server side (DB reads, XP, certificates,
 * notifications). The rules themselves live in `lib/codeathon-results.ts`.
 *
 * Flow (POST /api/codeathons/[id]/release):
 *   1. build standings from submissions (best per problem, summed)
 *   2. atomically claim the release on the codeathon doc (results_released
 *      false → true, released_at); a second caller gets "already released"
 *   3. write the frozen snapshot to `codeathon_results` ($setOnInsert, so the
 *      first snapshot always wins)
 *   4. award XP once per member (idempotent xp event key), issue certificates
 *      (idempotent issue_key) and notify participants
 * Step 4 can be re-run from the frozen snapshot ("re-issue"); it only
 * notifies people whose certificate was created by that run.
 */
import type { Db } from 'mongodb'
import {
  computeCodeathonStandings,
  countUnscored,
  certificateKindFor,
  codeathonCertificateWording,
  releaseXp,
  publicName,
  type CertificatePolicy,
  type CodeathonEntrantInfo,
  type CodeathonStanding,
  type CodeathonSubmissionLike,
} from '@/lib/codeathon-results'
import { codeathonWindow } from '@/lib/codeathon-run'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>

export interface CodeathonResultsDoc {
  codeathon_id: string
  tenant_id: string | null
  title: string
  event_type: 'individual' | 'team'
  released_at: string
  released_by: string
  certificate_policy: CertificatePolicy
  ranked_count: number
  participant_count: number
  standings: CodeathonStanding[]
}

let resultsIndex: Promise<unknown> | null = null
export async function codeathonResults(db: Db) {
  const col = db.collection<CodeathonResultsDoc>('codeathon_results')
  if (!resultsIndex) {
    resultsIndex = col.createIndex({ codeathon_id: 1 }, { unique: true, name: 'codeathon_results_unique' }).catch((e) => {
      resultsIndex = null
      console.error('[codeathon-release] index build failed', e)
    })
  }
  await resultsIndex
  return col
}

/** Names for user ids from the canonical `user` collection (never emails). */
async function userNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const { users } = await import('@/lib/db/admin')
  const rows = await (await users())
    .find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids } }] } as Record<string, unknown>, { projection: { id: 1, fullName: 1, name: 1 } })
    .toArray()
  for (const u of rows as Rec[]) out.set(String(u.id || u._id), publicName(u.fullName || u.name))
  return out
}

export interface StandingsBuild {
  standings: CodeathonStanding[]
  unscored: number
  ended: boolean
  teamMode: boolean
}

/** Final standings for a codeathon, rebuilt from its submissions. */
export async function buildCodeathonStandings(db: Db, codeathon: Rec): Promise<StandingsBuild> {
  const id = String(codeathon.id || '')
  const teamMode = codeathon.event_type === 'team'
  const subs = await db
    .collection('codeathon_submissions')
    .find({ codeathon_id: id }, { projection: { _id: 0, user_id: 1, team_id: 1, problem_id: 1, score: 1, status: 1 } })
    .toArray() as Array<CodeathonSubmissionLike & Rec>

  const entrants = new Map<string, CodeathonEntrantInfo>()
  if (teamMode) {
    const teamIds = [...new Set(subs.map((s) => (typeof s.team_id === 'string' ? s.team_id : '')).filter(Boolean))]
    const [teams, members] = await Promise.all([
      db.collection('codeathon_teams').find({ codeathon_id: id, id: { $in: teamIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray(),
      db.collection('codeathon_team_members').find({ codeathon_id: id, team_id: { $in: teamIds } }, { projection: { _id: 0, team_id: 1, user_id: 1 } }).toArray(),
    ])
    const names = await userNames(db, [...new Set(members.map((m) => String(m.user_id || '')).filter(Boolean))])
    for (const t of teams) {
      const mids = members.filter((m) => m.team_id === t.id).map((m) => String(m.user_id || '')).filter(Boolean)
      entrants.set(String(t.id), {
        entrant_id: String(t.id),
        kind: 'team',
        name: publicName(t.name, 'Team'),
        member_ids: mids,
        member_names: mids.map((m) => names.get(m) || 'Participant'),
      })
    }
  } else {
    const userIds = [...new Set(subs.map((s) => (typeof s.user_id === 'string' ? s.user_id : '')).filter(Boolean))]
    const names = await userNames(db, userIds)
    for (const uid of userIds) {
      entrants.set(uid, { entrant_id: uid, kind: 'user', name: names.get(uid) || 'Participant', member_ids: [uid] })
    }
  }

  return {
    standings: computeCodeathonStandings(subs, entrants, teamMode),
    unscored: countUnscored(subs),
    ended: codeathonWindow(codeathon).ended,
    teamMode,
  }
}

export interface ReleaseCounts {
  entrants: number
  ranked: number
  xp_awarded: number
  certificates_issued: number
  certificates_existing: number
  notified: number
  failed: number
}

/**
 * XP + certificates + notifications from a frozen snapshot. Safe to re-run:
 * XP and certificates are keyed, and with `notifyAll: false` only people who
 * got a new certificate in this run are notified.
 */
export async function finalizeCodeathonRelease(
  results: CodeathonResultsDoc,
  codeathon: Rec,
  opts: { notifyAll: boolean },
): Promise<ReleaseCounts> {
  const { awardXp } = await import('@/lib/db/leaderboard')
  const { issueCodeathonCertificate } = await import('@/lib/db/certifications')
  const { notify } = await import('@/lib/notifications')
  const id = results.codeathon_id
  const title = String(codeathon.title || results.title || 'the codeathon')
  const template = typeof codeathon.cert_template === 'string' ? codeathon.cert_template : undefined
  const counts: ReleaseCounts = {
    entrants: results.standings.length,
    ranked: results.ranked_count,
    xp_awarded: 0,
    certificates_issued: 0,
    certificates_existing: 0,
    notified: 0,
    failed: 0,
  }

  for (const st of results.standings) {
    const kind = certificateKindFor(st, results.certificate_policy)
    const wording = kind ? codeathonCertificateWording(kind, st, results.ranked_count) : null
    const xp = releaseXp(st.total_score)
    for (let i = 0; i < st.member_ids.length; i++) {
      const uid = st.member_ids[i]
      if (!uid) continue
      try {
        if (xp > 0) {
          // One XP event per member per codeathon (awardXp dedupes on submission_id + reason).
          const ev = await awardXp({
            userId: uid,
            amount: xp,
            reason: 'codeathon_result',
            submissionId: `codeathon-result:${id}`,
            metadata: { codeathon_id: id, rank: st.rank, kind: 'codeathon' },
          })
          if (ev) counts.xp_awarded++
        }
        const holder = st.kind === 'team' ? st.member_names?.[i] || 'Participant' : st.name
        const cert = kind && wording
          ? await issueCodeathonCertificate({
              codeathonId: id,
              codeathonTitle: title,
              userId: uid,
              holderName: holder,
              kind,
              level: wording.level,
              scoreLabel: wording.scoreLabel,
              rank: kind === 'rank' ? st.rank : null,
              template,
            })
          : null
        if (cert?.created) counts.certificates_issued++
        else if (cert) counts.certificates_existing++

        if (!opts.notifyAll && !cert?.created) continue
        const who = st.kind === 'team' ? `Your team "${st.name}"` : 'You'
        const placing = st.rank !== null
          ? `${who} ranked #${st.rank}${st.tied ? ' (tied)' : ''} of ${results.ranked_count} with ${st.total_score} points.`
          : 'Thanks for taking part.'
        const certLine = cert ? ' Your certificate is ready to view and share.' : ''
        const n = await notify({
          user_id: uid,
          type: 'hackathon.results',
          title: `Results released: ${title}`,
          message: `${placing}${certLine}`,
          link: `/codeathons/${id}/results`,
          icon: 'trophy',
          metadata: {
            codeathon_id: id,
            rank: st.rank,
            ...(cert ? { certificate_url: `/cert/verify/${cert.token}` } : {}),
          },
          send_email: true,
        })
        if (n) counts.notified++
      } catch (e) {
        counts.failed++
        console.error('[codeathon-release] finalize failed for', id, uid, e)
      }
    }
  }
  return counts
}
