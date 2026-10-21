/**
 * Leagues service (server only): season CRUD, loading released results for
 * a season window, computing the boards, finalising (frozen snapshot +
 * badges) and league teams. Points maths is in ./points.
 *
 * Only public events count: contests with public visibility, publicly
 * visible codeathons and non-draft hackathons, each with released results.
 * Public boards show colleges that opted in (campus_colleges.league_public)
 * and masked individual names ("Priya S.").
 */
import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import { codeathonPubliclyVisible } from '@/lib/codeathon-visibility'
import { buildLedger, collegeBoard, individualBoard, maskedName, seasonBadges, teamBoard, type LeagueEvent } from './points'
import { badgesCol, seasonsCol, snapshotsCol, teamsCol, type SnapshotDoc } from './store'
import { mergeConfig, overlayConfig, seasonConfigSchema, seasonInputSchema, type BadgeDoc, type Difficulty, type LeagueTeamDoc, type SeasonConfig, type SeasonDoc } from './types'

type Doc = Record<string, any>
type Actor = { id: string; email: string; role: string }

export class LeagueError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const MAX_EVENTS = 300
const PUBLIC_ROWS = 500

function normDifficulty(v: unknown): Difficulty {
  const s = String(v ?? '').toLowerCase()
  if (s.startsWith('easy') || s === 'beginner') return 'easy'
  if (s.startsWith('hard') || s === 'advanced' || s === 'expert' || s === 'tough') return 'hard'
  return 'medium'
}

/** Most common task difficulty of a hackathon. */
function majorityDifficulty(tasks: unknown): Difficulty {
  const counts = { easy: 0, medium: 0, hard: 0 }
  for (const t of Array.isArray(tasks) ? tasks : []) counts[normDifficulty((t as Doc)?.difficulty)]++
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as Difficulty) || 'medium'
}

// ─── Loading results ───────────────────────────────────────────────────────

export async function loadSeasonEvents(season: Pick<SeasonDoc, 'starts_at' | 'ends_at' | 'config'>): Promise<LeagueEvent[]> {
  const db = await getMongoDb()
  const cfg = mergeConfig(season.config)
  const window = { $gte: season.starts_at, $lte: season.ends_at }
  const events: LeagueEvent[] = []

  if (cfg.sources.contest) {
    const results = await db.collection('contest_results').find({ released_at: window }, { projection: { _id: 0, contest_id: 1, released_at: 1, ranked_count: 1, 'standings.member_ids': 1, 'standings.rank': 1 } }).limit(MAX_EVENTS).toArray()
    const meta = results.length ? await db.collection('contests').find({ id: { $in: results.map((r) => r.contest_id) }, visibility: 'public' }, { projection: { _id: 0, id: 1, title: 1, difficulty: 1, schedule: 1 } }).toArray() : []
    const m = new Map(meta.map((c) => [c.id, c]))
    for (const r of results) {
      const c = m.get(r.contest_id)
      if (!c) continue
      events.push({
        key: `contest:${c.id}`, kind: 'contest', title: String(c.title || 'Contest'), ended_at: String(c.schedule?.ends_at || r.released_at),
        difficulty: normDifficulty(c.difficulty), ranked: Number(r.ranked_count) || 0,
        entries: (r.standings || []).map((s: Doc) => ({ member_ids: (s.member_ids || []).map(String), rank: typeof s.rank === 'number' ? s.rank : null })),
      })
    }
  }

  if (cfg.sources.codeathon) {
    const results = await db.collection('codeathon_results').find({ released_at: window }, { projection: { _id: 0, codeathon_id: 1, title: 1, released_at: 1, ranked_count: 1, 'standings.member_ids': 1, 'standings.rank': 1 } }).limit(MAX_EVENTS).toArray()
    const meta = results.length ? await db.collection('codeathons').find({ id: { $in: results.map((r) => r.codeathon_id) } }, { projection: { _id: 0 } }).toArray() : []
    const m = new Map(meta.map((c) => [c.id, c]))
    for (const r of results) {
      const c = m.get(r.codeathon_id)
      if (!c || !codeathonPubliclyVisible(c)) continue
      events.push({
        key: `codeathon:${r.codeathon_id}`, kind: 'codeathon', title: String(r.title || c.title || 'Codeathon'), ended_at: String(c.end_date || c.ends_at || r.released_at),
        difficulty: normDifficulty(c.difficulty), ranked: Number(r.ranked_count) || 0,
        entries: (r.standings || []).map((s: Doc) => ({ member_ids: (s.member_ids || []).map(String), rank: typeof s.rank === 'number' ? s.rank : null })),
      })
    }
  }

  if (cfg.sources.hackathon) {
    const { rankTeams, withFinalPoints } = await import('@/lib/hackathons/final-scores')
    const { sanitizeJudgingConfig } = await import('@/lib/hackathons/judge-config')
    const hks = await db.collection('hackathons').find({ results_released: true, released_at: window, status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1, name: 1, ends_at: 1, released_at: 1, tasks: 1, judging_config: 1 } }).limit(100).toArray()
    for (const hk of hks) {
      const cfgJ = sanitizeJudgingConfig(hk.judging_config)
      const [teams, subs] = await Promise.all([
        db.collection('hackathon_teams').find({ hackathon_id: hk.id }, { projection: { _id: 0, id: 1, 'members.user_id': 1 } }).toArray(),
        db.collection('hackathon_submissions').find({ hackathon_id: hk.id, status: 'released' }, { projection: { _id: 0 } }).toArray(),
      ])
      const standings = rankTeams(teams.map((t) => t.id), withFinalPoints(subs, cfgJ), cfgJ)
      const tBy = new Map(teams.map((t) => [t.id, t]))
      const entries = standings.map((s) => ({ member_ids: ((tBy.get(s.team_id)?.members || []) as Doc[]).map((x) => String(x.user_id)).filter(Boolean), rank: s.rank }))
      events.push({
        key: `hackathon:${hk.id}`, kind: 'hackathon', title: String(hk.name || 'Hackathon'), ended_at: String(hk.ends_at || hk.released_at),
        difficulty: majorityDifficulty(hk.tasks), ranked: standings.filter((s) => s.rank !== null).length, entries,
      })
    }
  }
  return events
}

async function arenaSolves(season: Pick<SeasonDoc, 'starts_at' | 'ends_at'>): Promise<Map<string, number>> {
  const db = await getMongoDb()
  const rows = await db.collection('xp_events').aggregate<{ _id: string; n: number }>([
    { $match: { reason: 'arena_solved', created_at: { $gte: season.starts_at, $lte: season.ends_at } } },
    { $group: { _id: '$user_id', n: { $sum: 1 } } },
  ], { allowDiskUse: true }).toArray()
  return new Map(rows.map((r) => [String(r._id), r.n]))
}

/** user → college (tenant id) for verified students of colleges on the public league. */
async function collegeMembership(userIds: string[]): Promise<{ of: Map<string, string>; colleges: Map<string, { name: string; slug: string }> }> {
  const db = await getMongoDb()
  const of = new Map<string, string>()
  const colleges = new Map<string, { name: string; slug: string }>()
  if (!userIds.length) return { of, colleges }
  const pub = await db.collection('campus_colleges').find({ league_public: { $ne: false } }, { projection: { _id: 0, tenant_id: 1, name: 1, slug: 1 } }).limit(5000).toArray()
  for (const c of pub) colleges.set(String(c.tenant_id), { name: String(c.name), slug: String(c.slug) })
  const rows = await db.collection('campus_students').find({ user_id: { $in: userIds }, status: 'verified', college_id: { $in: [...colleges.keys()] } }, { projection: { _id: 0, user_id: 1, college_id: 1, joined_at: 1 } }).sort({ joined_at: 1 }).toArray()
  for (const r of rows) if (!of.has(String(r.user_id))) of.set(String(r.user_id), String(r.college_id))
  return { of, colleges }
}

/** Compute the three boards for a season (not stored). */
export async function computeSnapshot(season: SeasonDoc, now = new Date()): Promise<SnapshotDoc> {
  const cfg = mergeConfig(season.config)
  const ref = new Date(Math.min(now.getTime(), Date.parse(season.ends_at)))
  const [events, arena, teams] = await Promise.all([
    loadSeasonEvents(season),
    cfg.sources.arena ? arenaSolves(season) : Promise.resolve(new Map<string, number>()),
    (await teamsCol()).find({ season_id: season.id }, { projection: { _id: 0, id: 1, name: 1, slug: 1, member_ids: 1, college_id: 1 } }).toArray(),
  ])
  const ledger = buildLedger(events, arena, cfg, ref)
  const { of, colleges } = await collegeMembership([...ledger.keys()])
  const individual = individualBoard(ledger, of)
  const collegeRows = collegeBoard(individual, cfg)
  const teamRows = teamBoard(teams, ledger)

  const topIds = individual.slice(0, PUBLIC_ROWS * 4).map((r) => r.user_id)
  const db = await getMongoDb()
  const users = topIds.length ? await db.collection('user').find({ $or: [{ id: { $in: topIds } }, { _id: { $in: topIds as never[] } }] }, { projection: { id: 1, fullName: 1, name: 1 } }).toArray() : []
  const nameBy = new Map(users.map((u) => [String(u.id || u._id), maskedName(u.fullName || u.name)]))
  const tBy = new Map(teams.map((t) => [t.id, t]))
  return {
    season_id: season.id,
    computed_at: now.toISOString(),
    final: false,
    events: events.length,
    individual: individual.slice(0, PUBLIC_ROWS * 4).map((r) => ({ ...r, name: nameBy.get(r.user_id) ?? 'Participant' })),
    colleges: collegeRows.map((r) => ({ ...r, name: colleges.get(r.college_id)?.name ?? 'College', slug: colleges.get(r.college_id)?.slug ?? null })),
    teams: teamRows.slice(0, PUBLIC_ROWS).map((r) => {
      const t = tBy.get(r.team_id)!
      return { ...r, name: t.name, slug: t.slug, college_id: t.college_id, members: t.member_ids.length }
    }),
  }
}

/** Boards for a season: frozen snapshot once finalised, live otherwise. */
export async function seasonBoards(season: SeasonDoc): Promise<SnapshotDoc> {
  if (season.status === 'finalized') {
    const snap = await (await snapshotsCol()).findOne({ season_id: season.id }, { projection: { _id: 0 } })
    if (snap) return snap
  }
  return computeSnapshot(season)
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export async function listSeasons(opts: { publicOnly?: boolean } = {}): Promise<SeasonDoc[]> {
  const filter = opts.publicOnly ? { status: { $in: ['published', 'finalized'] } } : {}
  return (await seasonsCol()).find(filter as never, { projection: { _id: 0 } }).sort({ starts_at: -1 }).limit(100).toArray()
}

export async function getSeason(idOrSlug: string): Promise<SeasonDoc | null> {
  return (await seasonsCol()).findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] }, { projection: { _id: 0 } })
}

/** The season the public page leads with: live, else the latest published or final one. */
export function pickCurrent(seasons: readonly SeasonDoc[], now = new Date()): SeasonDoc | null {
  const visible = seasons.filter((s) => s.status !== 'draft')
  const t = now.getTime()
  return visible.find((s) => s.status === 'published' && Date.parse(s.starts_at) <= t && t <= Date.parse(s.ends_at))
    ?? [...visible].filter((s) => Date.parse(s.starts_at) <= t).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]
    ?? visible[visible.length - 1] ?? null
}

function parseConfig(raw: unknown): SeasonConfig | null {
  if (raw === undefined) return null
  const strict = seasonConfigSchema.safeParse(overlayConfig(raw))
  if (!strict.success) {
    const i = strict.error.issues[0]
    throw new LeagueError(i ? `${i.path.join('.') || 'config'}: ${i.message}` : 'Check the scoring settings')
  }
  return strict.data as SeasonConfig
}

export async function createSeason(actor: Actor, raw: unknown): Promise<SeasonDoc> {
  const p = seasonInputSchema.safeParse(raw)
  if (!p.success) throw new LeagueError(p.error.issues[0]?.message || 'Check the season form')
  const now = nowIso()
  const slug = p.data.slug || p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `season-${Date.now()}`
  const doc: SeasonDoc = {
    id: newId(), slug, name: p.data.name, starts_at: new Date(p.data.starts_at).toISOString(), ends_at: new Date(p.data.ends_at).toISOString(),
    status: p.data.status ?? 'draft', config: parseConfig(p.data.config) ?? mergeConfig({}), finalized_at: null, created_by: actor.id, created_at: now, updated_at: now,
  }
  try { await (await seasonsCol()).insertOne(doc) } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new LeagueError('A season with that slug exists', 409)
    throw e
  }
  return doc
}

export async function updateSeason(id: string, raw: unknown): Promise<SeasonDoc> {
  const cur = await getSeason(id)
  if (!cur) throw new LeagueError('Season not found', 404)
  if (cur.status === 'finalized') throw new LeagueError('A finalised season is frozen', 409)
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const p = seasonInputSchema.safeParse({ name: r.name ?? cur.name, starts_at: r.starts_at ?? cur.starts_at, ends_at: r.ends_at ?? cur.ends_at, ...(r.status ? { status: r.status } : {}), ...(r.config !== undefined ? { config: r.config } : {}) })
  if (!p.success) throw new LeagueError(p.error.issues[0]?.message || 'Check the season form')
  const set: Partial<SeasonDoc> = {
    name: p.data.name, starts_at: new Date(p.data.starts_at).toISOString(), ends_at: new Date(p.data.ends_at).toISOString(), updated_at: nowIso(),
    ...(p.data.status ? { status: p.data.status } : {}),
    ...(p.data.config !== undefined ? { config: parseConfig(p.data.config)! } : {}),
  }
  await (await seasonsCol()).updateOne({ id: cur.id }, { $set: set })
  return (await getSeason(cur.id))!
}

/**
 * Freeze the boards and award badges. Idempotent: the snapshot is written
 * once ($setOnInsert), badges have a unique key, a re-run only fills gaps.
 */
export async function finalizeSeason(id: string, now = new Date()): Promise<{ snapshot: SnapshotDoc; badges: number }> {
  const season = await getSeason(id)
  if (!season) throw new LeagueError('Season not found', 404)
  if (season.status === 'draft') throw new LeagueError('Publish the season first', 409)
  if (Date.parse(season.ends_at) > now.getTime()) throw new LeagueError('The season has not ended yet', 409)
  const snaps = await snapshotsCol()
  let snap = await snaps.findOne({ season_id: season.id }, { projection: { _id: 0 } })
  if (!snap) {
    const fresh = { ...(await computeSnapshot(season, now)), final: true }
    await snaps.updateOne({ season_id: season.id }, { $setOnInsert: fresh }, { upsert: true })
    snap = (await snaps.findOne({ season_id: season.id }, { projection: { _id: 0 } }))!
  }
  await (await seasonsCol()).updateOne({ id: season.id, status: { $ne: 'finalized' } }, { $set: { status: 'finalized', finalized_at: now.toISOString(), updated_at: now.toISOString() } })

  const cfg = mergeConfig(season.config)
  const awards = seasonBadges({ individual: snap.individual, colleges: snap.colleges, teams: snap.teams }, cfg)
  const teamMembers = new Map((await (await teamsCol()).find({ season_id: season.id }, { projection: { _id: 0, id: 1, member_ids: 1 } }).toArray()).map((t) => [t.id, t.member_ids]))
  const docs: BadgeDoc[] = awards.flatMap((a): BadgeDoc[] => {
    const base = { season_id: season.id, season_name: season.name, subject: a.subject, subject_id: a.subject_id, badge: a.badge, rank: a.rank, label: `${a.label} · ${season.name}`, awarded_at: now.toISOString() }
    if (a.subject === 'user') return [{ id: newId(), ...base, user_id: a.subject_id }]
    if (a.subject === 'team') return (teamMembers.get(a.subject_id) || []).map((u) => ({ id: newId(), ...base, user_id: u }))
    return [{ id: newId(), ...base, user_id: null }]
  })
  let inserted = 0
  const col = await badgesCol()
  const newlyAwarded: string[] = []
  for (const d of docs) {
    const r = await col.updateOne({ season_id: d.season_id, subject: d.subject, subject_id: d.subject_id, user_id: d.user_id }, { $setOnInsert: d }, { upsert: true })
    if (r.upsertedCount) { inserted++; if (d.user_id) newlyAwarded.push(d.user_id) }
  }
  if (newlyAwarded.length) {
    void import('@/lib/notifications').then(({ notifyMany }) => notifyMany([...new Set(newlyAwarded)], {
      type: 'league.badge', title: 'You earned a league badge', message: `Final standings for ${season.name} are in.`, link: '/dashboard/leagues', icon: 'trophy',
    })).catch((e) => logger.error('[leagues] badge notify failed', (e as Error).message))
  }
  return { snapshot: snap, badges: inserted }
}

// ─── Teams ──────────────────────────────────────────────────────────────────

const codeHash = (c: string) => createHash('sha256').update(c.trim().toUpperCase()).digest('hex')

async function teamCollege(memberIds: string[]): Promise<string | null> {
  const db = await getMongoDb()
  const rows = await db.collection('campus_students').find({ user_id: { $in: memberIds }, status: 'verified' }, { projection: { _id: 0, user_id: 1, college_id: 1 } }).toArray()
  const by = new Map<string, Set<string>>()
  for (const r of rows) {
    const s = by.get(String(r.college_id)) ?? new Set()
    s.add(String(r.user_id))
    by.set(String(r.college_id), s)
  }
  for (const [c, s] of by) if (memberIds.every((m) => s.has(m))) return c
  return null
}

async function openSeason(seasonId: string): Promise<SeasonDoc> {
  const s = await getSeason(seasonId)
  if (!s || s.status !== 'published') throw new LeagueError('This season is not open for teams', 404)
  if (Date.parse(s.ends_at) < Date.now()) throw new LeagueError('This season has ended', 409)
  return s
}

export async function createTeam(actor: Actor, seasonId: unknown, nameRaw: unknown): Promise<{ team: LeagueTeamDoc; join_code: string }> {
  const season = await openSeason(String(seasonId ?? ''))
  const name = String(nameRaw ?? '').trim().replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 40) throw new LeagueError('Team name: 3–40 characters')
  if (!/^[\p{L}\p{N} .'&_-]+$/u.test(name)) throw new LeagueError('Team name can use letters, digits, spaces and . \' & _ -')
  const col = await teamsCol()
  if (await col.findOne({ season_id: season.id, member_ids: actor.id }, { projection: { _id: 1 } })) throw new LeagueError('You are already in a team this season', 409)
  const code = randomBytes(5).toString('hex').toUpperCase()
  const now = nowIso()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'team'}-${randomBytes(2).toString('hex')}`
  const team: LeagueTeamDoc = { id: newId(), season_id: season.id, name, slug, captain_id: actor.id, member_ids: [actor.id], college_id: await teamCollege([actor.id]), join_code_hash: codeHash(code), created_at: now, updated_at: now }
  await col.insertOne(team)
  return { team: stripTeam(team), join_code: code }
}

export async function joinTeam(actor: Actor, codeRaw: unknown): Promise<LeagueTeamDoc> {
  const code = String(codeRaw ?? '').trim()
  if (!/^[A-Fa-f0-9]{10}$/.test(code)) throw new LeagueError('Enter the 10-character team code')
  const col = await teamsCol()
  const team = await col.findOne({ join_code_hash: codeHash(code) }, { projection: { _id: 0 } })
  if (!team) throw new LeagueError('No team uses that code', 404)
  const season = await openSeason(team.season_id)
  const cfg = mergeConfig(season.config)
  if (team.member_ids.includes(actor.id)) return stripTeam(team)
  if (await col.findOne({ season_id: season.id, member_ids: actor.id }, { projection: { _id: 1 } })) throw new LeagueError('You are already in a team this season', 409)
  const r = await col.updateOne(
    { id: team.id, member_ids: { $ne: actor.id }, [`member_ids.${cfg.team.max_size - 1}`]: { $exists: false } },
    { $push: { member_ids: actor.id }, $set: { updated_at: nowIso() } },
  )
  if (!r.modifiedCount) throw new LeagueError(`This team is full (${cfg.team.max_size} members)`, 409)
  const members = [...team.member_ids, actor.id]
  await col.updateOne({ id: team.id }, { $set: { college_id: await teamCollege(members) } })
  return stripTeam((await col.findOne({ id: team.id }, { projection: { _id: 0 } }))!)
}

export async function leaveTeam(actor: Actor, teamId: string): Promise<void> {
  const col = await teamsCol()
  const team = await col.findOne({ id: teamId, member_ids: actor.id }, { projection: { _id: 0 } })
  if (!team) throw new LeagueError('Team not found', 404)
  await openSeason(team.season_id)
  const rest = team.member_ids.filter((m) => m !== actor.id)
  if (!rest.length) { await col.deleteOne({ id: team.id }); return }
  await col.updateOne({ id: team.id }, { $set: { member_ids: rest, captain_id: team.captain_id === actor.id ? rest[0] : team.captain_id, college_id: await teamCollege(rest), updated_at: nowIso() } })
}

function stripTeam(t: LeagueTeamDoc): LeagueTeamDoc {
  const { join_code_hash: _h, ...rest } = t as LeagueTeamDoc & { _id?: unknown }
  void _h
  return { ...rest, join_code_hash: '' }
}

/** Signed-in view: my teams (with member display names), my badges, open seasons. */
export async function myLeague(actor: Actor) {
  const [teams, badges, seasons] = await Promise.all([
    (await teamsCol()).find({ member_ids: actor.id }, { projection: { _id: 0, join_code_hash: 0 } }).sort({ created_at: -1 }).limit(20).toArray(),
    (await badgesCol()).find({ user_id: actor.id }, { projection: { _id: 0 } }).sort({ awarded_at: -1 }).limit(50).toArray(),
    listSeasons({ publicOnly: true }),
  ])
  const ids = [...new Set(teams.flatMap((t) => t.member_ids))]
  const db = await getMongoDb()
  const users = ids.length ? await db.collection('user').find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids as never[] } }] }, { projection: { id: 1, fullName: 1, name: 1 } }).toArray() : []
  const nameBy = new Map(users.map((u) => [String(u.id || u._id), maskedName(u.fullName || u.name)]))
  return {
    teams: teams.map((t) => ({ ...t, members: t.member_ids.map((m) => ({ name: nameBy.get(m) ?? 'Member', you: m === actor.id, captain: m === t.captain_id })), member_ids: undefined })),
    badges,
    seasons: seasons.map((s) => ({ id: s.id, slug: s.slug, name: s.name, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status, team: s.config?.team ?? null })),
  }
}
