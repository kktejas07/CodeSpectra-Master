/**
 * Contests: create, edit, publish, release results. Routes and the admin
 * agent's tools (lib/agent/tools/write/contests.ts) call these same
 * functions, so access rules, validation, XP, certificates and
 * notifications are identical.
 *
 * Staff = superadmin, or a tenant admin of the contest's own organisation
 * (lib/exam-access isTenantStaff — deny by default).
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { isTenantStaff } from '@/lib/exam-access'
import { checkNewJudges } from '@/lib/hackathons/admin-checks'
import { addedJudges } from '@/lib/services/judge-emails'
import { parseRepoUrl } from '@/lib/hackathons/repo-audit'
import { certificateKindFor, codeathonCertificateWording, publicName, releaseXp } from '@/lib/codeathon-results'
import { logger } from '@/lib/logger'
import { revalidateContent } from '@/lib/cache/revalidate'
import { knowledgeOnContestChange } from '@/lib/rag/hooks'
import { ok, fail, type ServiceResult, type ServiceUser } from '@/lib/services/result'
import { contestPhase, sanitizeCommon, parseFormat, slugify, splitConfig } from './config'
import { FORMATS, rankDirection } from './formats'
import { hashFlag, newSalt } from './scoring/ctf'
import { csvColumns, MAX_LABEL_ROWS } from './scoring/datathon'
import { computeStandings } from './standings'
import { clean, contestsCol, entriesCol, resultsCol, secretsCol, settingsCol, submissionsCol } from './store'
import { DEFAULT_CONTEST_SETTINGS, type PublicContestView, type ContestDoc, type ContestSecretDoc, type ContestSettings, type StandingRow } from './types'

type Who = Pick<ServiceUser, 'id' | 'role' | 'tenantId'> | null | undefined

const nowIso = () => new Date().toISOString()
const shortId = () => randomBytes(5).toString('hex')
const newId = () => `c_${randomBytes(9).toString('hex')}`

export function isContestStaff(user: Who, c: Pick<ContestDoc, 'tenant_id'> | null | undefined): boolean {
  if (!user || !c) return false
  return isTenantStaff(user, c as unknown as Record<string, unknown>)
}

export function isContestJudge(user: Who, c: Pick<ContestDoc, 'judging'> | null | undefined): boolean {
  return !!user && !!c && Array.isArray(c.judging?.judges) && c.judging.judges.includes(user.id)
}

function canCreate(user: Who): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  return user.role === 'tenant_admin' && !!user.tenantId
}

export async function findContest(idOrSlug: string): Promise<ContestDoc | null> {
  if (typeof idOrSlug !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(idOrSlug)) return null
  return clean(await (await contestsCol()).findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] }))
}

export async function loadStaffContest(user: Who, idOrSlug: string): Promise<ServiceResult<ContestDoc>> {
  const c = await findContest(idOrSlug)
  if (!c) return fail(404, 'Contest not found')
  if (!isContestStaff(user, c)) return fail(403, 'Forbidden')
  return ok(c)
}

export async function loadSecret(contestId: string): Promise<ContestSecretDoc> {
  const s = clean(await (await secretsCol()).findOne({ contest_id: contestId }))
  return s || { contest_id: contestId, salt: newSalt(), top: {}, tasks: {}, updated_at: nowIso() }
}

/** What anybody may see (drafts are only visible to staff — callers check). */
export function publicContest(c: ContestDoc, opts: { staff?: boolean; now?: number } = {}): PublicContestView {
  const { config_errors, created_by, judging, ...rest } = c
  void config_errors
  void created_by
  const started = (opts.now ?? Date.now()) >= Date.parse(c.schedule.starts_at)
  return { ...rest, config: started || opts.staff ? c.config : teaserConfig(c.config), judging: { rubric: judging?.rubric || [] } }
}

/** Before the start, tasks show only titles and points (briefs, code, datasets stay hidden). */
export function teaserConfig(config: ContestDoc['config']): ContestDoc['config'] {
  const { tasks, dataset_url, prompt, brief, ...top } = config
  void dataset_url
  void prompt
  void brief
  return {
    ...top,
    hidden_until_start: true,
    tasks: tasks.map((t) => ({ id: t.id, ...(t.title ? { title: t.title } : {}), ...(t.category ? { category: t.category } : {}), ...(t.points ? { points: t.points } : {}), ...(t.initial_points ? { initial_points: t.initial_points } : {}), ...(t.url ? { url: t.url } : {}) })),
  }
}

/**
 * Format-specific secret preparation: hash CTF flags, parse datathon labels,
 * check open-source repositories. Mutates `secret`; returns problems.
 */
export function prepareSecret(format: ContestDoc['format'], config: ContestDoc['config'], secret: Pick<ContestSecretDoc, 'salt' | 'top' | 'tasks'>): string[] {
  const errors: string[] = []
  if (format === 'ctf') {
    for (const [tid, t] of Object.entries(secret.tasks)) {
      const flag = t.flag
      if (typeof flag === 'string' && flag && !/^[0-9a-f]{64}$/.test(flag)) t.flag = hashFlag(secret.salt, flag)
      if (t.flag && !/^[0-9a-f]{64}$/.test(String(t.flag))) errors.push(`Challenge ${tid}: flag could not be stored.`)
    }
  }
  if (format === 'datathon') {
    const csv = secret.top.labels_csv
    if (typeof csv === 'string' && csv.trim()) {
      const idCol = String(config.id_column || 'id')
      const target = String(config.target_column || 'target')
      const r = csvColumns(csv, idCol, target, MAX_LABEL_ROWS)
      if (r.error) errors.push(`Labels: ${r.error}`)
      else if (r.map.size < 10) errors.push('Labels: add at least 10 rows.')
      else {
        secret.top.labels = Object.fromEntries(r.map)
        secret.top.labels_count = r.map.size
      }
      delete secret.top.labels_csv
    }
    if (!secret.top.labels) errors.push('Labels: upload the hidden labels CSV.')
    const url = String(config.dataset_url || '')
    if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) errors.push('Dataset link must be an https link.')
  }
  if (format === 'open_source_sprint') {
    for (const t of config.tasks) {
      const r = parseRepoUrl(String(t.url || ''))
      if ('error' in r) errors.push(`Repository "${String(t.url || '').slice(0, 80)}": ${r.error}.`)
      else if (!t.title) t.title = `${r.owner}/${r.repo}`
    }
  }
  if (format === 'ctf') {
    for (const t of config.tasks) {
      const url = String(t.attachment_url || '')
      if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) errors.push(`Challenge "${String(t.title)}": attachment must be an https link.`)
    }
  }
  return errors
}

async function uniqueSlug(title: string): Promise<string> {
  const col = await contestsCol()
  const base = slugify(title)
  let slug = base
  for (let i = 1; await col.findOne({ slug }, { projection: { _id: 1 } }); i++) slug = `${base}-${i < 5 ? i : shortId()}`
  return slug
}

async function notifyNewJudges(c: ContestDoc, ids: string[]): Promise<void> {
  if (!ids.length) return
  const { notifyMany } = await import('@/lib/notifications')
  await notifyMany(ids, {
    type: 'hackathon.team_invite', title: `You're judging ${c.title}`,
    message: 'You were added as a judge. Open the contest to score submissions.',
    title_i18n: { key: 'contest.judge.title', params: { title: c.title } },
    message_i18n: { key: 'contest.judge.message' },
    link: `/contests/${c.slug}/judge`, icon: 'gavel', send_email: true,
  }).catch((e) => logger.error('[contests] judge notify failed', (e as Error).message))
}

export async function createContest(user: ServiceUser, body: Record<string, unknown>): Promise<ServiceResult<ContestDoc>> {
  if (!canCreate(user)) return fail(403, 'Forbidden')
  const format = parseFormat(body.format)
  if (!format) return fail(400, 'Pick a contest format.')
  const common = sanitizeCommon(body, format)
  if (!common.ok) return fail(400, common.error)
  const judgeError = await checkNewJudges(user, common.value.judging.judges, [])
  if (judgeError) return fail(403, judgeError)

  const id = newId()
  const split = splitConfig(format, body.config ?? {}, null, () => `t${shortId()}`)
  const secret: ContestSecretDoc = { contest_id: id, salt: newSalt(), top: split.secret.top, tasks: split.secret.tasks, updated_at: nowIso() }
  const errors = [...split.errors, ...prepareSecret(format, split.config, secret)]
  const now = nowIso()
  const doc: ContestDoc = {
    id, slug: await uniqueSlug(common.value.title), format, status: 'draft',
    ...common.value,
    config: split.config, config_errors: errors,
    results_released: false, released_at: null, published_at: null,
    tenant_id: user.role === 'superadmin' ? (typeof body.tenant_id === 'string' && body.tenant_id ? body.tenant_id : user.tenantId ?? null) : user.tenantId ?? null,
    created_by: user.id, created_at: now, updated_at: now,
  }
  await (await contestsCol()).insertOne({ ...doc })
  await (await secretsCol()).insertOne({ ...secret })
  await notifyNewJudges(doc, doc.judging.judges)
  knowledgeOnContestChange(doc.id, doc.tenant_id)
  return ok(doc, 201)
}

export async function updateContest(user: ServiceUser, idOrSlug: string, body: Record<string, unknown>): Promise<ServiceResult<ContestDoc>> {
  const loaded = await loadStaffContest(user, idOrSlug)
  if (!loaded.ok) return loaded
  const cur = loaded.data
  if (cur.results_released) return fail(409, 'Results are released; this contest can no longer be edited.')
  if (body.format !== undefined && body.format !== cur.format) return fail(400, 'The format cannot change after creation. Create a new contest instead.')
  const merged = {
    title: cur.title, summary: cur.summary, description: cur.description, visibility: cur.visibility, schedule: cur.schedule,
    participation: cur.participation, leaderboard: cur.leaderboard, certificates: cur.certificates, judging: cur.judging,
    prize_text: cur.prize_text, banner_url: cur.banner_url,
    ...body,
  }
  const common = sanitizeCommon(merged, cur.format)
  if (!common.ok) return fail(400, common.error)
  if (cur.status !== 'draft' && common.value.participation.mode !== cur.participation.mode) {
    return fail(409, 'Solo or team cannot change after publishing.')
  }
  const judgeError = await checkNewJudges(user, common.value.judging.judges, cur.judging?.judges || [])
  if (judgeError) return fail(403, judgeError)

  const prev = await loadSecret(cur.id)
  const set: Partial<ContestDoc> = { ...common.value, updated_at: nowIso() }
  if (body.config !== undefined) {
    const split = splitConfig(cur.format, body.config, prev, () => `t${shortId()}`)
    const secret = { salt: prev.salt, top: split.secret.top, tasks: split.secret.tasks }
    set.config = split.config
    set.config_errors = [...split.errors, ...prepareSecret(cur.format, split.config, secret)]
    await (await secretsCol()).updateOne({ contest_id: cur.id }, { $set: { ...secret, contest_id: cur.id, updated_at: nowIso() } }, { upsert: true })
  }
  const col = await contestsCol()
  await col.updateOne({ id: cur.id }, { $set: set })
  const next = clean(await col.findOne({ id: cur.id }))!
  await notifyNewJudges(next, addedJudges(next.judging.judges, cur.judging?.judges))
  if (cur.status !== 'draft') await revalidateContent('contests', cur.slug)
  knowledgeOnContestChange(cur.id, cur.tenant_id)
  return ok(next)
}

/** Publish (draft → published), unpublish (back to draft while nobody joined) or close. */
export async function setContestStatus(user: ServiceUser, idOrSlug: string, action: 'publish' | 'unpublish' | 'close'): Promise<ServiceResult<ContestDoc>> {
  const loaded = await loadStaffContest(user, idOrSlug)
  if (!loaded.ok) return loaded
  const c = loaded.data
  const col = await contestsCol()
  const now = nowIso()
  if (action === 'publish') {
    if (c.status === 'published') return fail(409, 'Already published.')
    if (c.status === 'closed') return fail(409, 'This contest is closed.')
    if (c.config_errors?.length) return fail(400, `Fix these first: ${c.config_errors.slice(0, 5).join(' ')}`)
    if (Date.parse(c.schedule.ends_at) <= Date.now()) return fail(400, 'The end date has passed. Move the dates before publishing.')
    await col.updateOne({ id: c.id, status: 'draft' }, { $set: { status: 'published', published_at: now, updated_at: now } })
  } else if (action === 'unpublish') {
    if (c.status !== 'published') return fail(409, 'Only a published contest can go back to draft.')
    const entries = await (await entriesCol()).countDocuments({ contest_id: c.id })
    if (entries > 0) return fail(409, 'People have already joined. Close the contest instead.')
    await col.updateOne({ id: c.id }, { $set: { status: 'draft', updated_at: now } })
  } else {
    if (c.status === 'closed') return fail(409, 'Already closed.')
    await col.updateOne({ id: c.id }, { $set: { status: 'closed', updated_at: now } })
  }
  // /contests is ISR: show (or drop) the contest now.
  await revalidateContent('contests', c.slug)
  knowledgeOnContestChange(c.id, c.tenant_id)
  return ok(clean(await col.findOne({ id: c.id }))!)
}

// ─── Standings + release ─────────────────────────────────────────────────────

export async function liveStandings(c: ContestDoc, opts: { before?: string | null; usePrivate?: boolean } = {}): Promise<StandingRow[]> {
  const [entries, subs] = await Promise.all([
    (await entriesCol()).find({ contest_id: c.id }, { projection: { _id: 0, id: 1, name: 1, kind: 1, member_ids: 1 } }).limit(20000).toArray(),
    (await submissionsCol()).find({ contest_id: c.id }, { projection: { _id: 0, id: 1, entry_id: 1, task_id: 1, status: 1, score: 1, private_score: 1, detail: 1, created_at: 1 } }).limit(200000).toArray(),
  ])
  return computeStandings(entries, subs, {
    format: c.format, config: c.config, direction: rankDirection(c.format, c.config), tieBreak: c.leaderboard.tie_break,
    before: opts.before ?? null, usePrivate: opts.usePrivate,
  })
}

export interface ContestReleasePreview {
  ended: boolean
  entries: number
  ranked: number
  pending_review: number
  reasons: string[]
  already_released: boolean
}

export async function previewContestRelease(user: ServiceUser, idOrSlug: string): Promise<ServiceResult<ContestReleasePreview>> {
  const loaded = await loadStaffContest(user, idOrSlug)
  if (!loaded.ok) return loaded
  const c = loaded.data
  const standings = await liveStandings(c, { usePrivate: c.format === 'datathon' })
  const pending = await (await submissionsCol()).countDocuments({ contest_id: c.id, status: 'pending_review' })
  const ended = Date.now() >= Date.parse(c.schedule.ends_at)
  const reasons: string[] = []
  if (c.status === 'draft') reasons.push('This contest was never published.')
  if (!ended) reasons.push('The contest has not ended yet. Releasing now stops new submissions.')
  if (pending > 0) reasons.push(`${pending} submission${pending === 1 ? ' is' : 's are'} still waiting for judges and will not count.`)
  if (standings.length === 0) reasons.push('Nobody has joined, so there are no results to publish.')
  return ok({ ended, entries: standings.length, ranked: standings.filter((s) => s.rank !== null).length, pending_review: pending, reasons, already_released: c.results_released })
}

/** Release results: frozen board, XP, certificates and notifications (once). */
export async function releaseContestResults(user: ServiceUser, idOrSlug: string, opts: { force?: boolean } = {}): Promise<ServiceResult<Record<string, unknown>>> {
  const pre = await previewContestRelease(user, idOrSlug)
  if (!pre.ok) return pre
  const c = (await findContest(idOrSlug))!
  if (c.results_released) return fail(409, 'Results are already released')
  if (c.status === 'draft') return fail(409, 'Publish the contest before releasing results.')
  if (pre.data.reasons.length && !opts.force) {
    return fail(409, pre.data.reasons.join(' '), { error: pre.data.reasons.join(' '), code: 'confirm_release', reasons: pre.data.reasons })
  }
  const now = nowIso()
  const claimed = await (await contestsCol()).findOneAndUpdate(
    { id: c.id, results_released: false },
    { $set: { results_released: true, released_at: now, updated_at: now } },
    { returnDocument: 'after' },
  )
  if (!claimed) return fail(409, 'Results are already released')

  const standings = await liveStandings(c, { usePrivate: c.format === 'datathon' })
  const ranked = standings.filter((s) => s.rank !== null).length
  await (await resultsCol()).updateOne(
    { contest_id: c.id },
    { $setOnInsert: { contest_id: c.id, released_at: now, released_by: user.id, ranked_count: ranked, standings: standings.slice(0, 5000) } },
    { upsert: true },
  )
  knowledgeOnContestChange(c.id, c.tenant_id)

  const { awardXp } = await import('@/lib/db/leaderboard')
  const { issueCodeathonCertificate } = await import('@/lib/db/certifications')
  const { notify } = await import('@/lib/notifications')
  const entries = await (await entriesCol()).find({ contest_id: c.id }, { projection: { _id: 0, id: 1, members: 1 } }).toArray()
  const membersOf = new Map(entries.map((e) => [e.id, e.members]))
  const label = FORMATS[c.format].label
  let certificates = 0
  let notified = 0
  let failed = 0
  for (const st of standings) {
    const kind = certificateKindFor(st, c.certificates)
    const wording = kind ? codeathonCertificateWording(kind, st, ranked) : null
    // Datathon totals are metric values (0.91, 12.4…), so XP follows the rank there.
    const xp = Math.min(1000, c.format === 'datathon' ? (st.rank ? Math.max(10, 110 - st.rank * 10) : 0) : releaseXp(st.total))
    for (const m of membersOf.get(st.entry_id) || []) {
      try {
        if (xp > 0) {
          await awardXp({ userId: m.user_id, amount: xp, reason: 'codeathon_result', submissionId: `contest-result:${c.id}`, metadata: { contest_id: c.id, rank: st.rank, kind: 'contest' } })
        }
        // Certificates reuse the codeathon issuer (idempotent per contest + person).
        const cert = kind && wording
          ? await issueCodeathonCertificate({ codeathonId: `contest-${c.id}`, codeathonTitle: c.title, userId: m.user_id, holderName: publicName(m.name), kind, level: wording.level, scoreLabel: wording.scoreLabel, rank: kind === 'rank' ? st.rank : null, source: `CodeSpectra ${label.toLowerCase()}` })
          : null
        if (cert?.created) certificates++
        const who = st.kind === 'team' ? `Your team "${st.name}"` : 'You'
        const placing = st.rank !== null ? `${who} ranked #${st.rank}${st.tied ? ' (tied)' : ''} of ${ranked}.` : 'Thanks for taking part.'
        const n = await notify({
          user_id: m.user_id, type: 'hackathon.results', title: `Results released: ${c.title}`,
          message: `${placing}${cert ? ' Your certificate is ready to view and share.' : ''}`,
          title_i18n: { key: 'results.title', params: { title: c.title } },
          message_i18n: [
            st.rank === null ? { key: 'results.thanks' } : { key: `results.ranked${st.kind === 'team' ? 'Team' : 'You'}${st.tied ? 'Tied' : ''}`, params: { name: st.name, rank: st.rank, total: ranked } },
            ...(cert ? [{ key: 'results.certReady' }] : []),
          ],
          link: `/contests/${c.slug}`, icon: 'trophy',
          metadata: { contest_id: c.id, rank: st.rank, ...(cert ? { certificate_url: `/cert/verify/${cert.token}` } : {}) },
          send_email: true,
        })
        if (n) notified++
      } catch (e) {
        failed++
        logger.error('[contests] release finalize failed', c.id, (e as Error).message)
      }
    }
  }
  return ok({ released_at: now, entries: standings.length, ranked, certificates_issued: certificates, notified, failed })
}

// ─── Platform settings (AI caps) ─────────────────────────────────────────────

export function sanitizeSettings(raw: unknown): ContestSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const n = (v: unknown, d: number, lo: number, hi: number) => {
    const x = Number(v)
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d
  }
  return {
    ai_daily_runs: Math.round(n(r.ai_daily_runs, DEFAULT_CONTEST_SETTINGS.ai_daily_runs, 0, 100000)),
    ai_monthly_cost_usd: n(r.ai_monthly_cost_usd, DEFAULT_CONTEST_SETTINGS.ai_monthly_cost_usd, 0, 10000),
    ai_cost_per_1k_tokens_usd: n(r.ai_cost_per_1k_tokens_usd, DEFAULT_CONTEST_SETTINGS.ai_cost_per_1k_tokens_usd, 0, 1),
  }
}

export async function getContestSettings(): Promise<ContestSettings> {
  const doc = await (await settingsCol()).findOne({ id: 'global' })
  return sanitizeSettings(doc || {})
}

export async function saveContestSettings(user: ServiceUser, raw: unknown): Promise<ServiceResult<ContestSettings>> {
  if (user.role !== 'superadmin') return fail(403, 'Forbidden')
  const s = sanitizeSettings(raw)
  await (await settingsCol()).updateOne({ id: 'global' }, { $set: { ...s, id: 'global', updated_at: nowIso(), updated_by: user.id } }, { upsert: true })
  return ok(s)
}

/** Admin list (own organisation; superadmin sees everything). */
export async function listAdminContests(user: ServiceUser, opts: { status?: string; limit?: number } = {}): Promise<ServiceResult<ContestDoc[]>> {
  if (!canCreate(user)) return fail(403, 'Forbidden')
  const filter: Record<string, unknown> = user.role === 'superadmin' ? {} : { tenant_id: user.tenantId }
  if (opts.status && ['draft', 'published', 'closed'].includes(opts.status)) filter.status = opts.status
  const rows = await (await contestsCol()).find(filter, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, opts.limit || 100)).toArray()
  return ok(rows as ContestDoc[])
}

export { contestPhase }
