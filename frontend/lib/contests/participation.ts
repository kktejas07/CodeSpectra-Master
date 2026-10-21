/**
 * Taking part in a contest (server only): register solo or as a team,
 * submit for each format, run samples / the reverse-coding black box,
 * leaderboard views and judging.
 *
 * Code runs through the shared Piston path (lib/codeathon-run). Uploads use
 * the shared type checks (lib/marketplace/seller-files detectProductFileType)
 * and ClamAV scan (lib/ats/files virusScan). Prompt-a-thon runs go through
 * lib/ai/backend with prompt-guard and three spend caps (per person runs,
 * per contest USD, platform daily runs + monthly USD).
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { runCodeathonCode } from '@/lib/codeathon-run'
import { publicName } from '@/lib/codeathon-results'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { logger } from '@/lib/logger'
import { ok, fail, type ServiceResult, type ServiceUser } from '@/lib/services/result'
import { parseTests, parseEvalCases, registrationOpen, submissionsOpen, type TestCase } from './config'
import { FORMATS, rankDirection, taskLanguages, type FileSlot } from './formats'
import { golfLength, outputMatches, scoreDebug, scoreTests } from './scoring/code'
import { verifyFlag } from './scoring/ctf'
import { csvColumns, scorePredictions, type DatathonMetric } from './scoring/datathon'
import { buildPromptRun, estimateCostUsd, matchOutput, passRate, promptPoints } from './scoring/prompt'
import { cleanRubricScores, judgedScore, judgeTotal, wordCount } from './scoring/judged'
import { isGithubLogin, parsePrUrl, prEligibility, registeredRepoKeys, type GithubPull } from './scoring/oss'
import { freezeStart } from './standings'
import { getContestSettings, isContestJudge, isContestStaff, liveStandings, loadSecret } from './service'
import { clean, contestsCol, entriesCol, filesCol, resultsCol, submissionsCol, usageCol, type ContestFileDoc } from './store'
import type { ContestDoc, ContestEntryDoc, ContestFileRef, ContestSubmissionDoc, JudgeScore, StandingRow } from './types'

const nowIso = () => new Date().toISOString()
const rid = (p: string) => `${p}_${randomBytes(9).toString('hex')}`
const MAX_CODE = 64 * 1024

type Who = Pick<ServiceUser, 'id' | 'role' | 'tenantId'> & { name?: string; fullName?: string; email?: string }

function displayName(u: Who): string {
  return publicName(u.fullName || u.name, 'Participant')
}

export async function myEntry(contestId: string, userId: string): Promise<ContestEntryDoc | null> {
  return clean(await (await entriesCol()).findOne({ contest_id: contestId, member_ids: userId }))
}

/** Owner view of an entry (join code only for the team captain). */
export function entryView(e: ContestEntryDoc, userId: string) {
  const captain = e.members.find((m) => m.role === 'captain')?.user_id === userId
  return {
    id: e.id, kind: e.kind, name: e.name,
    members: e.members.map((m) => ({ name: m.name, role: m.role, github_login: m.github_login || null, me: m.user_id === userId })),
    join_code: e.kind === 'team' && captain ? e.join_code : null,
    is_captain: captain,
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

export interface RegisterInput { action: 'register' | 'join' | 'leave' | 'github'; team_name?: string; join_code?: string; github_login?: string }

export async function registerForContest(user: Who, c: ContestDoc, input: RegisterInput): Promise<ServiceResult<ReturnType<typeof entryView> | { left: true }>> {
  const col = await entriesCol()
  const existing = await myEntry(c.id, user.id)
  const now = nowIso()

  if (input.action === 'github') {
    if (!existing) return fail(404, 'Join the contest first.')
    const login = String(input.github_login || '').trim()
    if (!isGithubLogin(login)) return fail(400, 'Enter a valid GitHub username.')
    await col.updateOne({ id: existing.id, 'members.user_id': user.id }, { $set: { 'members.$.github_login': login, updated_at: now } })
    return ok(entryView((await myEntry(c.id, user.id))!, user.id))
  }

  if (input.action === 'leave') {
    if (!existing) return fail(404, 'You are not registered.')
    if (Date.now() >= Date.parse(c.schedule.starts_at)) return fail(409, 'The contest has started, so you can no longer leave.')
    const rest = existing.members.filter((m) => m.user_id !== user.id)
    if (rest.length === 0) await col.deleteOne({ id: existing.id })
    else {
      if (!rest.some((m) => m.role === 'captain')) rest[0] = { ...rest[0], role: 'captain' }
      await col.updateOne({ id: existing.id }, { $set: { members: rest, member_ids: rest.map((m) => m.user_id), updated_at: now } })
    }
    return ok({ left: true as const })
  }

  if (!registrationOpen(c)) return fail(409, 'Registration is not open.')
  if (existing) return fail(409, 'You are already registered.')
  const member = { user_id: user.id, name: displayName(user), role: 'member' as const, github_login: isGithubLogin(input.github_login) ? input.github_login : null }

  if (input.action === 'join') {
    if (c.participation.mode !== 'team') return fail(400, 'This contest is solo.')
    const code = String(input.join_code || '').trim().toUpperCase()
    if (!/^[A-Z0-9]{6,12}$/.test(code)) return fail(400, 'Enter the team code your captain shared.')
    // Atomic size check: only joins while the team has room.
    const r = await col.findOneAndUpdate(
      { contest_id: c.id, join_code: code, [`member_ids.${c.participation.team_max - 1}`]: { $exists: false }, member_ids: { $ne: user.id } },
      { $push: { members: member, member_ids: user.id }, $set: { updated_at: now } },
      { returnDocument: 'after' },
    )
    if (!r) {
      const team = await col.findOne({ contest_id: c.id, join_code: code }, { projection: { _id: 1 } })
      return fail(team ? 409 : 404, team ? 'That team is full.' : 'No team with that code.')
    }
    emitRegistered(c, user.id, r.name)
    return ok(entryView(clean(r)!, user.id))
  }

  if (c.participation.max_entries > 0 && (await col.countDocuments({ contest_id: c.id })) >= c.participation.max_entries) {
    return fail(409, 'This contest is full.')
  }
  const team = c.participation.mode === 'team'
  const teamName = String(input.team_name || '').trim().replace(/\s+/g, ' ').slice(0, 60)
  if (team && teamName.length < 2) return fail(400, 'Give your team a name.')
  const doc: ContestEntryDoc = {
    id: rid('e'), contest_id: c.id, kind: team ? 'team' : 'user', name: team ? publicName(teamName, 'Team') : member.name,
    members: [{ ...member, role: 'captain' }], member_ids: [user.id],
    join_code: team ? randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(8, 'X').slice(0, 8) : null,
    created_at: now, updated_at: now,
  }
  await col.insertOne({ ...doc })
  emitRegistered(c, user.id, team ? doc.name : '')
  return ok(entryView(doc, user.id), 201)
}

function emitRegistered(c: ContestDoc, userId: string, teamName: string) {
  void import('@/lib/automation/events')
    .then(({ emit }) => emit('hackathon.registered', {
      event_id: c.id, event_kind: 'contest', event_name: c.title, user_id: userId, team_name: teamName, starts_at: c.schedule.starts_at,
    }, { tenantId: c.tenant_id ?? null, idempotencyKey: `hackathon.registered:contest:${c.id}:${userId}` }))
    .catch((e) => logger.error('[contests] automation emit failed', (e as Error).message))
}

// ─── Submissions ─────────────────────────────────────────────────────────────

export interface SubmitInput {
  task_id?: string
  language?: string
  code?: string
  flag?: string
  prompt?: string
  pr_url?: string
  text?: string
}

export interface UploadedFile { role: string; name: string; bytes: Uint8Array }
/** A file the browser already put in the uploads bucket (POST /api/contests/[id]/uploads). */
export interface DirectFile { role: string; upload_id: string }

type SubResult = ServiceResult<{ submission: ReturnType<typeof submissionView> }>

export function submissionView(s: ContestSubmissionDoc) {
  return {
    id: s.id, task_id: s.task_id, status: s.status, score: s.score, private_score: null as number | null,
    feedback: s.feedback, detail: s.detail, files: s.files, created_at: s.created_at,
    judged: s.judge_scores.length,
  }
}

async function limit(key: string, max: number, windowMs: number, msg: string): Promise<string | null> {
  const r = await rateLimitRedis(key, max, windowMs)
  return r.ok ? null : `${msg} Try again in ${r.retryAfterSec} s.`
}

function taskOf(c: ContestDoc, taskId: unknown): Record<string, unknown> | null {
  if (!FORMATS[c.format].task) return { id: '_' }
  return (c.config.tasks.find((t) => t.id === taskId) as Record<string, unknown> | undefined) || null
}

async function runTests(code: string, language: string, tests: TestCase[]): Promise<{ passed: number; total: number; samples: { passed: boolean; input: string; expected: string; output: string }[]; error: string }> {
  let passed = 0
  const samples: { passed: boolean; input: string; expected: string; output: string }[] = []
  let firstError = ''
  for (const t of tests) {
    const r = await runCodeathonCode(code, language, t.input)
    const okRun = !r.error || r.exitCode === 0
    const good = okRun && outputMatches(r.output, t.expected)
    if (good) passed++
    else if (!firstError && r.error) firstError = r.error.slice(0, 400)
    if (t.sample) samples.push({ passed: good, input: t.input.slice(0, 2000), expected: t.expected.slice(0, 2000), output: r.output.slice(0, 2000) })
  }
  return { passed, total: tests.length, samples, error: firstError }
}

async function insertSubmission(doc: ContestSubmissionDoc): Promise<SubResult> {
  await (await submissionsCol()).insertOne({ ...doc })
  return ok({ submission: submissionView(doc) }, 201)
}

export async function submitToContest(user: Who, c: ContestDoc, input: SubmitInput, files: UploadedFile[] = [], direct: DirectFile[] = []): Promise<SubResult> {
  if (!submissionsOpen(c)) return fail(409, 'Submissions are closed.')
  const entry = await myEntry(c.id, user.id)
  if (!entry) return fail(403, 'Join the contest first.')
  const meta = FORMATS[c.format]
  const task = taskOf(c, input.task_id)
  if (!task) return fail(404, 'Unknown task.')
  const taskId = String(task.id)
  const secret = await loadSecret(c.id)
  const sec = (meta.task ? secret.tasks[taskId] : secret.top) || {}
  const base: ContestSubmissionDoc = {
    id: rid('s'), contest_id: c.id, entry_id: entry.id, user_id: user.id, task_id: taskId, status: 'scored', score: null, private_score: null,
    feedback: '', detail: {}, payload: {}, files: [], judge_scores: [], created_at: nowIso(),
  }

  switch (meta.submission) {
    case 'code': {
      const limited = await limit(`contest-submit:${c.id}:${user.id}`, 10, 60_000, 'Too many submissions.')
      if (limited) return fail(429, limited)
      const language = String(input.language || '').toLowerCase()
      if (!taskLanguages(task).includes(language)) return fail(400, `Use one of: ${taskLanguages(task).join(', ')}.`)
      const code = String(input.code ?? '')
      if (!code.trim()) return fail(400, 'Write some code first.')
      if (code.length > MAX_CODE) return fail(400, 'Code is too long (64 KB at most).')
      const tests = parseTests(sec.tests)
      if (!tests.length) return fail(409, 'This task has no tests yet. Tell the organiser.')
      const run = await runTests(code, language, tests)
      const points = Number(task.points) || 100
      const detail: Record<string, unknown> = { passed: run.passed, total: run.total, samples: run.samples, ...(run.error ? { error: run.error } : {}) }
      let score = scoreTests(run.passed, run.total, points)
      if (c.format === 'debug_a_thon') {
        score = scoreDebug({
          passed: run.passed, total: run.total, points,
          minutesElapsed: (Date.now() - Date.parse(c.schedule.starts_at)) / 60_000,
          penaltyPerMinute: Number(c.config.penalty_per_minute) || 0, minPercent: Number(c.config.min_percent) || 0,
        })
      }
      if (c.format === 'code_golf') {
        detail.length = golfLength(code)
        detail.all_passed = run.passed === run.total
        score = 0 // set relative to the shortest solution in the standings
      }
      return insertSubmission({
        ...base, score, detail, payload: { language, code },
        feedback: c.format === 'code_golf'
          ? (run.passed === run.total ? `All tests pass — ${detail.length} characters.` : `${run.passed} of ${run.total} tests pass. Golf only counts when every test passes.`)
          : `${run.passed} of ${run.total} tests pass.`,
      })
    }

    case 'flag': {
      const perMin = Math.max(1, Number(c.config.attempts_per_minute) || 5)
      const limited = await limit(`contest-flag:${c.id}:${entry.id}:${taskId}`, perMin, 60_000, 'Too many flag attempts.')
      if (limited) return fail(429, limited)
      const flag = String(input.flag ?? '').slice(0, 200)
      if (!flag.trim()) return fail(400, 'Enter a flag.')
      const subs = await submissionsCol()
      if (await subs.findOne({ contest_id: c.id, entry_id: entry.id, task_id: taskId, 'detail.correct': true }, { projection: { _id: 1 } })) {
        return fail(409, 'Your team already solved this challenge.')
      }
      const correct = verifyFlag(secret.salt, flag, String(sec.flag || ''))
      // The attempted flag is never stored.
      return insertSubmission({ ...base, score: 0, detail: { correct }, feedback: correct ? 'Correct flag. Points depend on how many teams solve it.' : 'Not the flag.' })
    }

    case 'csv': {
      const slot = files.find((f) => f.role === 'predictions')
      if (!slot) return fail(400, 'Upload your predictions CSV.')
      const bad = checkFile(meta.files![0], slot)
      if (bad) return fail(400, bad)
      const perDay = Math.max(1, Number(c.config.submissions_per_day) || 5)
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      if ((await (await submissionsCol()).countDocuments({ contest_id: c.id, entry_id: entry.id, created_at: { $gte: since }, status: 'scored' })) >= perDay) {
        return fail(429, `Your entry can upload ${perDay} times per 24 hours.`)
      }
      const labels = (secret.top.labels || {}) as Record<string, string>
      if (!Object.keys(labels).length) return fail(409, 'This datathon has no labels yet. Tell the organiser.')
      const text = Buffer.from(slot.bytes).toString('utf8')
      const preds = csvColumns(text, String(c.config.id_column || 'id'), String(c.config.target_column || 'target'))
      if (preds.error) return fail(400, preds.error)
      const r = scorePredictions(labels, preds.map, {
        metric: (String(c.config.metric || 'accuracy') as DatathonMetric), positiveLabel: String(c.config.positive_label ?? '1'),
        salt: secret.salt, publicPercent: Number(c.config.public_percent) || 30,
      })
      if (r.error || r.public === null) return fail(400, r.error || 'Could not score this file.')
      return insertSubmission({
        ...base, score: r.public, private_score: r.private,
        detail: { metric: c.config.metric, public: r.public, rows: r.matched, extra_rows: r.extra, direction: rankDirection(c.format, c.config) },
        payload: { file_name: slot.name.slice(0, 200), size: slot.bytes.byteLength },
        feedback: `Public ${String(c.config.metric || 'accuracy')}: ${r.public}`,
      })
    }

    case 'prompt':
      return submitPrompt(user, c, entry, task, sec, base, input)

    case 'files': {
      const text = String(input.text ?? '').slice(0, 60000)
      if (c.format === 'system_design_jam') {
        const words = wordCount(text)
        const max = Number(c.config.max_words) || 2000
        if (words < 50) return fail(400, 'Write up your design (at least 50 words).')
        if (words > max) return fail(400, `Keep the write-up under ${max} words (it has ${words}).`)
      } else if (text.trim().length < 20) return fail(400, 'Add a short summary of your idea.')
      const limited = await limit(`contest-upload:${c.id}:${user.id}`, 10, 10 * 60_000, 'Too many uploads.')
      if (limited) return fail(429, limited)
      const refs: ContestFileRef[] = []
      const { findReadyUpload } = await import('@/lib/storage/uploads')
      for (const slot of meta.files || []) {
        const f = files.find((x) => x.role === slot.role)
        const d = f ? undefined : direct.find((x) => x.role === slot.role)
        const required = slot.role === 'video' && c.format === 'ideathon' ? c.config.video_required !== false : slot.required
        if (!f && !d) { if (required) return fail(400, `Add the ${slot.label.toLowerCase()}.`); continue }
        if (f) {
          const bad = checkFile(slot, f)
          if (bad) return fail(400, bad)
        } else if (d && !(await findReadyUpload({ uploadId: d.upload_id, ownerId: user.id, scope: contestUploadScope(c.id, entry.id, slot.role) }))) {
          return fail(400, `${slot.label}: upload the file again.`)
        }
      }
      for (const slot of meta.files || []) {
        const f = files.find((x) => x.role === slot.role)
        const d = f ? undefined : direct.find((x) => x.role === slot.role)
        if (!f && !d) continue
        const stored = f ? await storeFile(c, entry, user.id, slot, f) : await attachDirectFile(c, entry, user.id, slot, d as DirectFile)
        if (!stored.ok) return stored
        refs.push(stored.data)
      }
      return insertSubmission({ ...base, status: 'pending_review', payload: { text }, files: refs, feedback: 'Submitted. Judges will score it after the contest.' })
    }

    case 'pr_url':
      return submitPr(user, c, entry, base, input)
  }
}

// ─── Files ───────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  csv: 'text/csv', pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
}

/** Extension + magic bytes for a file slot (pure). Returns a message or null. */
export function checkFile(slot: FileSlot, f: UploadedFile): string | null {
  return checkFileHead(slot, f.name, f.bytes, f.bytes.byteLength, slot.maxBytes)
}

/** Byte cap for a slot: the in-request cap, or the larger direct-upload cap when object storage is on. */
export function slotMaxBytes(slot: FileSlot, large: boolean, limits: { videoBytes: number; fileBytes: number }): number {
  if (!large) return slot.maxBytes
  return Math.max(slot.maxBytes, slot.role === 'video' ? limits.videoBytes : limits.fileBytes)
}

export const contestUploadScope = (contestId: string, entryId: string, role: string) => `contest:${contestId}:${entryId}:${role}`

export const contestMime = (name: string) => MIME[name.toLowerCase().split('.').pop() || ''] || 'application/octet-stream'

/** Extension and size only (before the bytes exist). */
export function checkFileMeta(slot: FileSlot, name: string, size: number, maxBytes: number): string | null {
  const ext = (name.toLowerCase().split('.').pop() || '')
  if (!slot.exts.includes(ext)) return `${slot.label}: upload a ${slot.exts.map((e) => e.toUpperCase()).join(' or ')} file.`
  if (!size) return `${slot.label}: the file is empty.`
  if (size > maxBytes) return `${slot.label}: files can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.`
  return null
}

/** Same checks as checkFile on the first bytes of a file of `size` bytes (direct uploads sniff a 64 KB range). */
export function checkFileHead(slot: FileSlot, name: string, head: Uint8Array, size: number, maxBytes: number): string | null {
  const declared = checkFileMeta(slot, name, size, maxBytes)
  if (declared) return declared
  const ext = (name.toLowerCase().split('.').pop() || '')
  const f = { bytes: head }
  const h = Buffer.from(head.subarray(0, 12))
  const zip = h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04
  const okBytes =
    ext === 'csv' ? !Buffer.from(f.bytes.subarray(0, 8192)).includes(0)
      : ext === 'pdf' ? h.subarray(0, 5).toString('latin1') === '%PDF-'
        : ext === 'pptx' ? zip
          : ext === 'mp4' ? h.subarray(4, 8).toString('latin1') === 'ftyp'
            : ext === 'png' ? h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
              : ext === 'jpg' || ext === 'jpeg' ? h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff
                : false
  return okBytes ? null : `${slot.label}: the file content does not match its type.`
}

async function storeFile(c: ContestDoc, entry: ContestEntryDoc, userId: string, slot: FileSlot, f: UploadedFile): Promise<ServiceResult<ContestFileRef>> {
  const { safeFileName, virusScan, FileRejected } = await import('@/lib/ats/files')
  const name = safeFileName(f.name)
  try {
    await virusScan(Buffer.from(f.bytes), name)
  } catch (e) {
    if (e instanceof FileRejected) return fail(e.message.includes('offline') ? 503 : 400, e.message)
    throw e
  }
  const mime = contestMime(name)
  // Private uploads bucket when configured (lib/storage), else inline in Mongo (≤ 9 MB slots, under the 16 MB doc cap).
  const { putBlob } = await import('@/lib/storage/blobs')
  const blob = await putBlob({ feature: 'contest', tenantId: null, bytes: Buffer.from(f.bytes), contentType: mime })
  const doc: ContestFileDoc = {
    id: rid('f'), contest_id: c.id, entry_id: entry.id, user_id: userId, role: slot.role, name, mime,
    size: f.bytes.byteLength, ...blob, created_at: nowIso(),
  }
  await (await filesCol()).insertOne(doc)
  return ok({ id: doc.id, role: doc.role, name: doc.name, mime: doc.mime, size: doc.size })
}

/** Attach a finished direct upload (already size-, type- and virus-checked) to the entry. */
async function attachDirectFile(c: ContestDoc, entry: ContestEntryDoc, userId: string, slot: FileSlot, d: DirectFile): Promise<ServiceResult<ContestFileRef>> {
  const { claimUpload } = await import('@/lib/storage/uploads')
  const up = await claimUpload({ uploadId: d.upload_id, ownerId: userId, scope: contestUploadScope(c.id, entry.id, slot.role) })
  if (!up) return fail(400, `${slot.label}: upload the file again.`)
  const doc: ContestFileDoc = {
    id: rid('f'), contest_id: c.id, entry_id: entry.id, user_id: userId, role: slot.role, name: up.name, mime: up.content_type,
    size: up.size, storage: 's3', s3_key: up.key, created_at: nowIso(),
  }
  await (await filesCol()).insertOne(doc)
  return ok({ id: doc.id, role: doc.role, name: doc.name, mime: doc.mime, size: doc.size })
}

/** A stored file if this person may download it (staff, judge, or on the entry). */
export async function readContestFile(user: Who, c: ContestDoc, fileId: string): Promise<ContestFileDoc | null> {
  if (!/^f_[0-9a-f]{18}$/.test(fileId)) return null
  const f = await (await filesCol()).findOne({ id: fileId, contest_id: c.id })
  if (!f) return null
  if (isContestStaff(user, c) || isContestJudge(user, c)) return f
  const entry = await myEntry(c.id, user.id)
  return entry && entry.id === f.entry_id ? f : null
}

// ─── Prompt-a-thon ───────────────────────────────────────────────────────────

async function submitPrompt(user: Who, c: ContestDoc, entry: ContestEntryDoc, task: Record<string, unknown>, sec: Record<string, unknown>, base: ContestSubmissionDoc, input: SubmitInput): Promise<SubResult> {
  const prompt = String(input.prompt ?? '')
  const maxChars = Number(c.config.max_prompt_chars) || 2000
  if (prompt.trim().length < 10) return fail(400, 'Write a prompt (at least 10 characters).')
  if (prompt.length > maxChars) return fail(400, `Keep the prompt under ${maxChars} characters.`)
  const { scanPrompt } = await import('@/lib/ai/prompt-guard')
  const scan = scanPrompt(prompt)
  if (scan.flagged) return fail(400, 'This prompt tries to change the model’s rules or pull hidden data, which is against the contest rules. Rewrite it to solve the task.')
  const cases = parseEvalCases(sec.eval_cases).cases
  if (!cases.length) return fail(409, 'This task has no eval set yet. Tell the organiser.')

  // Caps: per person (whole contest), per contest spend, platform day + month.
  const usage = await usageCol()
  const subs = await submissionsCol()
  const runsCap = Math.max(1, Number(c.config.runs_per_user) || 10)
  if ((await subs.countDocuments({ contest_id: c.id, user_id: user.id })) >= runsCap) return fail(429, `You have used all ${runsCap} runs for this contest.`)
  const limited = await limit(`contest-prompt:${user.id}`, 3, 60_000, 'One run at a time, please.')
  if (limited) return fail(429, limited)
  const settings = await getContestSettings()
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const [contestSpend, dayRuns, monthSpend] = await Promise.all([
    usage.aggregate<{ s: number }>([{ $match: { contest_id: c.id } }, { $group: { _id: null, s: { $sum: '$cost_usd' } } }]).toArray(),
    usage.countDocuments({ at: { $gte: dayAgo } }),
    usage.aggregate<{ s: number }>([{ $match: { at: { $gte: monthStart } } }, { $group: { _id: null, s: { $sum: '$cost_usd' } } }]).toArray(),
  ])
  const capUsd = Number(c.config.spend_cap_usd ?? 2)
  if ((contestSpend[0]?.s || 0) >= capUsd) return fail(429, 'This contest has used its model budget. The organiser can raise it.')
  if (dayRuns >= settings.ai_daily_runs) return fail(429, 'The model is busy today. Try again tomorrow.')
  if ((monthSpend[0]?.s || 0) >= settings.ai_monthly_cost_usd) return fail(429, 'The model budget for this month is used up.')

  const { backendComplete } = await import('@/lib/ai/backend')
  const { withUsageMeter, estimateTokens } = await import('@/lib/ai/usage-meter')
  let tokens = 0
  const results: boolean[] = []
  let errors = 0
  await withUsageMeter((u) => { tokens += u.inputTokens + u.outputTokens }, async () => {
    for (const ec of cases) {
      const req = buildPromptRun(prompt, ec.input)
      try {
        const r = await backendComplete({ systemMessage: req.system, userMessage: req.user, modelRole: 'fast', responseFormat: 'text', feature: 'contest_prompt_a_thon', userId: user.id, cache: false })
        const out = String(r.text ?? r.raw ?? '').slice(0, 4000)
        if (!r.ok) errors++
        results.push(r.ok && matchOutput(out, ec.expected, ec.match))
      } catch {
        errors++
        results.push(false)
        tokens += estimateTokens(req.system + req.user)
      }
    }
  })
  const cost = estimateCostUsd(tokens, settings.ai_cost_per_1k_tokens_usd)
  await usage.insertOne({ contest_id: c.id, user_id: user.id, task_id: String(task.id), tokens, cost_usd: cost, at: nowIso() })
  if (errors === cases.length) return fail(502, 'The model is not answering right now. This run was not counted against your score; try again shortly.')
  const rate = passRate(results)
  const passed = results.filter(Boolean).length
  return insertSubmission({
    ...base, score: promptPoints(rate, Number(task.points) || 100),
    detail: { passed, total: cases.length, pass_rate: Math.round(rate * 1000) / 10 },
    payload: { prompt }, feedback: `${passed} of ${cases.length} hidden cases pass.`,
  })
}

// ─── Open-source sprint ──────────────────────────────────────────────────────

async function fetchPull(owner: string, repo: string, n: number): Promise<{ ok: true; pr: GithubPull } | { ok: false; status: number }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'codespectra-contests' }
  // Optional server token raises GitHub's limit (60 → 5000 req/h); public data only either way.
  const token = process.env.GITHUB_PUBLIC_API_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${n}`, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, pr: (await res.json()) as GithubPull }
  } catch {
    return { ok: false, status: 0 }
  }
}

async function submitPr(user: Who, c: ContestDoc, entry: ContestEntryDoc, base: ContestSubmissionDoc, input: SubmitInput): Promise<SubResult> {
  const limited = await limit(`contest-pr:${user.id}`, 10, 60_000, 'Too many checks.')
  if (limited) return fail(429, limited)
  const ref = parsePrUrl(String(input.pr_url || ''))
  if ('error' in ref) return fail(400, ref.error)
  const subs = await submissionsCol()
  const maxPrs = Math.max(1, Number(c.config.max_prs_per_entry) || 20)
  if ((await subs.countDocuments({ contest_id: c.id, entry_id: entry.id, status: 'scored' })) >= maxPrs) return fail(409, `Your entry already has ${maxPrs} pull requests counted.`)
  if (await subs.findOne({ contest_id: c.id, 'payload.pr_key': ref.key }, { projection: { _id: 1 } })) return fail(409, 'That pull request has already been counted.')
  const repos = registeredRepoKeys(c.config.tasks.map((t) => String(t.url || '')))
  const logins = entry.members.map((m) => m.github_login || '').filter(Boolean)
  if (!logins.length) return fail(400, 'Add your GitHub username to your entry first.')
  const got = await fetchPull(ref.owner, ref.repo, ref.number)
  if (!got.ok) return fail(got.status === 404 ? 404 : 502, got.status === 404 ? 'GitHub has no public pull request at that link.' : 'Could not reach GitHub. Try again in a minute.')
  const verdict = prEligibility(got.pr, ref, { repos, logins, startsAt: c.schedule.starts_at, endsAt: c.schedule.ends_at })
  if (!verdict.ok) return fail(400, verdict.reason)
  const repoTask = c.config.tasks.find((t) => registeredRepoKeys([String(t.url || '')]).has(`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`))
  try {
    return await insertSubmission({
      ...base, task_id: String(repoTask?.id || '_'), score: Number(c.config.points_per_pr) || 10,
      detail: { title: String(got.pr.title || '').slice(0, 200), merged_at: got.pr.merged_at, author: got.pr.user?.login || null },
      payload: { pr_url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`, pr_key: ref.key },
      feedback: 'Merged pull request verified.',
    })
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return fail(409, 'That pull request has already been counted.')
    throw e
  }
}

// ─── Sample runs + black box ─────────────────────────────────────────────────

export async function runForContest(user: Who, c: ContestDoc, input: { mode: 'samples' | 'blackbox'; task_id?: string; language?: string; code?: string; input?: string }): Promise<ServiceResult<Record<string, unknown>>> {
  if (!submissionsOpen(c)) return fail(409, 'The contest is not live.')
  if (!(await myEntry(c.id, user.id))) return fail(403, 'Join the contest first.')
  const task = taskOf(c, input.task_id)
  if (!task) return fail(404, 'Unknown task.')
  if (input.mode === 'blackbox') {
    if (c.format !== 'reverse_coding') return fail(400, 'Only reverse coding has a black box.')
    const perHour = Number(c.config.blackbox_runs_per_hour ?? 20)
    if (perHour <= 0) return fail(403, 'The black box is off for this contest.')
    const limited = await limit(`contest-blackbox:${c.id}:${user.id}:${String(task.id)}`, perHour, 3600_000, `You can run this black box ${perHour} times an hour.`)
    if (limited) return fail(429, limited)
    const secret = await loadSecret(c.id)
    const sec = secret.tasks[String(task.id)] || {}
    const stdin = String(input.input ?? '').slice(0, 4000)
    const r = await runCodeathonCode(String(sec.reference_code || ''), String(sec.reference_language || 'python'), stdin)
    // The reference program's errors are not shown (they could leak its source).
    return ok({ output: r.output.slice(0, 4000), failed: !!r.error && r.exitCode !== 0 })
  }
  if (!FORMATS[c.format].sampleRuns) return fail(400, 'This format has no sample runs.')
  const limited = await limit(`contest-run:${c.id}:${user.id}`, 20, 60_000, 'Too many runs.')
  if (limited) return fail(429, limited)
  const language = String(input.language || '').toLowerCase()
  if (!taskLanguages(task).includes(language)) return fail(400, `Use one of: ${taskLanguages(task).join(', ')}.`)
  const code = String(input.code ?? '')
  if (!code.trim() || code.length > MAX_CODE) return fail(400, 'Write some code first (64 KB at most).')
  const samples = (Array.isArray(task.samples) ? task.samples : []) as { input: string; expected: string }[]
  const examples = (Array.isArray(task.examples) ? task.examples : []) as { input: string; output: string }[]
  const cases: TestCase[] = samples.length ? samples.map((s) => ({ input: s.input, expected: s.expected, sample: true })) : examples.map((e) => ({ input: e.input, expected: e.output, sample: true }))
  if (!cases.length) return fail(409, 'This task has no sample tests.')
  const r = await runTests(code, language, cases)
  return ok({ passed: r.passed, total: r.total, results: r.samples, error: r.error || null, ...(c.format === 'code_golf' ? { length: golfLength(code) } : {}) })
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface PublicStanding { rank: number | null; tied: boolean; name: string; kind: 'user' | 'team'; total: number; solved: number; tasks: Record<string, number>; me: boolean }

function toPublic(rows: StandingRow[], myEntryId: string | null): PublicStanding[] {
  return rows.map((r) => ({ rank: r.rank, tied: r.tied, name: r.name, kind: r.kind, total: r.total, solved: r.solved, tasks: r.tasks, me: r.entry_id === myEntryId }))
}

export async function contestLeaderboard(user: Who | null, c: ContestDoc): Promise<ServiceResult<{ rows: PublicStanding[]; frozen_at: string | null; final: boolean; hidden_reason: string | null }>> {
  const staff = isContestStaff(user, c)
  const mine = user ? await myEntry(c.id, user.id) : null
  if (c.results_released) {
    const res = await (await resultsCol()).findOne({ contest_id: c.id })
    if (res) return ok({ rows: toPublic(res.standings, mine?.id || null), frozen_at: null, final: true, hidden_reason: null })
  }
  const ended = Date.now() >= Date.parse(c.schedule.ends_at)
  if (!staff) {
    if (c.leaderboard.visibility === 'hidden') return ok({ rows: [], frozen_at: null, final: false, hidden_reason: 'The leaderboard appears when results are released.' })
    if (c.leaderboard.visibility === 'after_end' && !ended) return ok({ rows: [], frozen_at: null, final: false, hidden_reason: 'The leaderboard appears when the contest ends.' })
  }
  // Freeze stays until results are released (the public never sees the last minutes early).
  const frozen = staff ? null : freezeStart(c.schedule.ends_at, c.leaderboard.freeze_minutes)
  const rows = await liveStandings(c, { before: frozen })
  return ok({ rows: toPublic(rows, mine?.id || null).slice(0, 500), frozen_at: frozen, final: false, hidden_reason: null })
}

// ─── Judging ─────────────────────────────────────────────────────────────────

export async function listForJudging(user: Who, c: ContestDoc): Promise<ServiceResult<Array<Record<string, unknown>>>> {
  if (!isContestStaff(user, c) && !isContestJudge(user, c)) return fail(403, 'Forbidden')
  if (!FORMATS[c.format].judged) return fail(400, 'This format is scored automatically.')
  const subs = await (await submissionsCol()).find({ contest_id: c.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(2000).toArray()
  const entries = await (await entriesCol()).find({ contest_id: c.id }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
  const names = new Map(entries.map((e) => [e.id, e.name]))
  // Judges score each entry's latest submission.
  const latest = new Map<string, ContestSubmissionDoc>()
  for (const s of subs) if (!latest.has(s.entry_id)) latest.set(s.entry_id, s)
  return ok([...latest.values()].map((s) => ({
    id: s.id, entry_name: names.get(s.entry_id) || 'Entry', status: s.status, score: s.score, text: String(s.payload?.text || ''), files: s.files,
    created_at: s.created_at, judges: s.judge_scores.length, my_score: s.judge_scores.find((j) => j.judge_id === user.id) || null,
  })))
}

export async function scoreSubmission(user: Who, c: ContestDoc, input: { submission_id?: unknown; scores?: unknown; comment?: unknown }): Promise<ServiceResult<{ score: number | null; judges: number }>> {
  if (!isContestStaff(user, c) && !isContestJudge(user, c)) return fail(403, 'Forbidden')
  if (!FORMATS[c.format].judged) return fail(400, 'This format is scored automatically.')
  if (c.results_released) return fail(409, 'Results are released; scores are final.')
  const col = await submissionsCol()
  const sub = await col.findOne({ id: String(input.submission_id || ''), contest_id: c.id })
  if (!sub) return fail(404, 'Submission not found')
  const scores = cleanRubricScores(input.scores, c.judging.rubric)
  if (!scores) return fail(400, 'Score every rubric criterion.')
  const total = judgeTotal(scores, c.judging.rubric)
  if (total === null) return fail(400, 'This contest has no rubric.')
  const js: JudgeScore = { judge_id: user.id, scores, total, comment: String(input.comment ?? '').slice(0, 2000), at: nowIso() }
  const judgeScores = [...sub.judge_scores.filter((j) => j.judge_id !== user.id), js]
  const score = judgedScore(judgeScores, { dropHighLow: c.judging.drop_high_low })
  await col.updateOne({ id: sub.id }, { $set: { judge_scores: judgeScores, score, status: 'scored' } })
  return ok({ score, judges: judgeScores.length })
}

// ─── Public listing ──────────────────────────────────────────────────────────

/** Published, public contests that have not ended (or ended within 30 days). */
export async function listPublicContests(opts: { includeEnded?: boolean } = {}): Promise<ContestDoc[]> {
  const cutoff = new Date(Date.now() - (opts.includeEnded ? 30 * 24 * 3600_000 : 0)).toISOString()
  const rows = await (await contestsCol())
    .find({ status: { $in: ['published', 'closed'] }, visibility: 'public', 'schedule.ends_at': { $gt: cutoff } }, { projection: { _id: 0 } })
    .sort({ 'schedule.starts_at': 1 })
    .limit(200)
    .toArray()
  return rows as ContestDoc[]
}

export async function contestsForUser(userId: string): Promise<ContestDoc[]> {
  const entries = await (await entriesCol()).find({ member_ids: userId }, { projection: { contest_id: 1 } }).limit(200).toArray()
  if (!entries.length) return []
  return (await (await contestsCol()).find({ id: { $in: entries.map((e) => e.contest_id) } }, { projection: { _id: 0 } }).toArray()) as ContestDoc[]
}

export async function mySubmissions(c: Pick<ContestDoc, 'id' | 'format'>, entryId: string) {
  const rows = await (await submissionsCol()).find({ contest_id: c.id, entry_id: entryId }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
  // CTF and code-golf points depend on everyone else (see the leaderboard), so no per-submission number.
  const relative = c.format === 'ctf' || c.format === 'code_golf'
  return rows.map((s) => ({ ...submissionView(s), ...(relative ? { score: null } : {}) }))
}

export { contestsCol }
