/**
 * Google Classroom for an organisation: OAuth (teacher account), import a
 * course roster, post an assignment that links to a CodeSpectra test, and
 * write released results back as grades.
 *
 * OAuth app: the organisation's own Google OAuth client (entered on the
 * settings page, stored encrypted), else GOOGLE_CLASSROOM_CLIENT_ID /
 * GOOGLE_CLASSROOM_CLIENT_SECRET, else the platform's Google app from
 * Admin → Settings → Hiring integrations (ats_google_client_id / secret).
 * Redirect URI: <origin>/api/integrations/google-classroom/callback.
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'
import { fail } from '@/lib/community/http'
import { lazyCollection } from '@/lib/community/lazy'
import { signToken, verifyToken, type SignedPayload } from '@/lib/ats/interviews/tokens'
import { getSecret, markIntegrationError, saveIntegration } from './store'
import { ensureIntegrationLink } from './exam-links'
import { CLASSROOM_API, bestPercentByEmail, classroomAuthUrl, courseWorkBody, gradePatches, type OAuthApp } from './classroom-pure'

interface ClassroomSecret { app: OAuthApp | null; refresh_token?: string; access_token?: string; expires_at?: number }
interface RosterDoc { tenant_id: string; course_id: string; google_user_id: string; email: string; name: string; updated_at: string }
interface LinkDoc { id: string; tenant_id: string; course_id: string; course_name: string; coursework_id: string; exam_id: string; exam_title: string; max_points: number; created_by: string; created_at: string; last_sync_at: string | null; last_synced: number }

const rostersCol = lazyCollection<RosterDoc>('classroom_rosters', (c) => Promise.all([
  c.createIndex({ tenant_id: 1, course_id: 1, google_user_id: 1 }, { unique: true, name: 'clr_unique' }),
  c.createIndex({ tenant_id: 1, email: 1 }, { name: 'clr_email' }),
]))
const linksCol = lazyCollection<LinkDoc>('classroom_links', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cll_id' }),
  c.createIndex({ tenant_id: 1, created_at: -1 }, { name: 'cll_tenant' }),
  c.createIndex({ exam_id: 1 }, { name: 'cll_exam' }),
]))

export const callbackUrl = () => `${getAppOrigin()}/api/integrations/google-classroom/callback`

async function platformApp(): Promise<OAuthApp | null> {
  const envId = (process.env.GOOGLE_CLASSROOM_CLIENT_ID || '').trim()
  const envSecret = (process.env.GOOGLE_CLASSROOM_CLIENT_SECRET || '').trim()
  if (envId && envSecret) return { client_id: envId, client_secret: envSecret }
  const { readServerSecrets } = await import('@/lib/server-secrets-cache')
  const s = (await readServerSecrets().catch(() => ({}))) as Record<string, unknown>
  const pick = (k: string, env: string) => {
    const v = typeof s[k] === 'string' ? String(s[k]).trim() : ''
    return v && !v.includes('•') ? v : (process.env[env] || '').trim()
  }
  const id = pick('ats_google_client_id', 'ATS_GOOGLE_CLIENT_ID')
  const secret = pick('ats_google_client_secret', 'ATS_GOOGLE_CLIENT_SECRET')
  return id && secret ? { client_id: id, client_secret: secret } : null
}

async function stateKey() {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('google-classroom-oauth-state')
}

export async function startConnect(tenantId: string, userId: string, own?: OAuthApp | null): Promise<string> {
  const app = own || (await platformApp())
  if (!app) throw fail('Google sign-in isn’t set up on this platform. Enter your own Google OAuth client ID and secret.', 409, 'classroom_no_app')
  if (own) await saveIntegration({ tenantId, provider: 'google_classroom', userId, secret: { app: own } satisfies ClassroomSecret, status: 'pending', label: null })
  const state = signToken(await stateKey(), { k: 'oauth', i: 'google_classroom', n: randomBytes(12).toString('hex'), e: Date.now() + 15 * 60_000, t: tenantId, u: userId, p: own ? 'own' : 'platform' })
  return classroomAuthUrl(app, callbackUrl(), state)
}

export async function verifyState(state: unknown): Promise<SignedPayload | null> {
  const p = verifyToken(await stateKey(), state, 'oauth')
  return p && p.i === 'google_classroom' && p.t && p.u ? p : null
}

export async function completeConnect(state: SignedPayload, code: string, f: typeof fetch = fetch): Promise<void> {
  const tenantId = state.t!
  const existing = state.p === 'own' ? await getSecret<ClassroomSecret>(tenantId, 'google_classroom') : null
  const app = state.p === 'own' ? existing?.secret?.app ?? null : await platformApp()
  if (!app) throw fail('The Google OAuth app for this connection is missing. Start again.', 409, 'classroom_no_app')
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: app.client_id, client_secret: app.client_secret, redirect_uri: callbackUrl(), grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string }
  if (!res.ok || !j.access_token || !j.refresh_token) throw fail('Google sign-in failed. Try connecting again.', 400, 'classroom_oauth_failed')
  let label: string | null = null
  try { label = String(JSON.parse(Buffer.from(String(j.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || '') || null } catch { label = null }
  await saveIntegration({
    tenantId, provider: 'google_classroom', userId: state.u!, label,
    secret: { app: state.p === 'own' ? app : null, refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 } satisfies ClassroomSecret,
  })
}

async function accessToken(tenantId: string, f: typeof fetch = fetch): Promise<string> {
  const r = await getSecret<ClassroomSecret>(tenantId, 'google_classroom')
  const c = r?.secret
  if (!r || r.row.status !== 'connected' || !c?.refresh_token) throw fail('Connect Google Classroom first.', 409, 'classroom_not_connected')
  if (c.access_token && (c.expires_at || 0) > Date.now()) return c.access_token
  const app = c.app || (await platformApp())
  if (!app) throw fail('The Google OAuth app is no longer configured. Reconnect Google Classroom.', 409, 'classroom_no_app')
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.client_id, client_secret: app.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15_000),
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !j.access_token) {
    await markIntegrationError(tenantId, 'google_classroom', `Google connection expired (${j.error || res.status}). Reconnect it.`)
    throw fail('The Google Classroom connection expired. Reconnect it.', 409, 'classroom_expired')
  }
  await saveIntegration({ tenantId, provider: 'google_classroom', userId: r.row.connected_by, secret: { ...c, access_token: j.access_token, expires_at: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 } })
  return j.access_token
}

async function api<T>(tenantId: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = await accessToken(tenantId)
  const res = await fetch(`${CLASSROOM_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) {
    if (res.status === 401) await markIntegrationError(tenantId, 'google_classroom', 'Google rejected the token. Reconnect Google Classroom.')
    throw fail(`Google Classroom answered ${res.status}${j?.error?.status ? ` (${j.error.status})` : ''}.`, 502, 'classroom_api_error', { status: res.status })
  }
  return j
}

async function paged<T>(tenantId: string, path: string, key: string, max = 2000): Promise<T[]> {
  const out: T[] = []
  let token = ''
  for (let i = 0; i < 40 && out.length < max; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await api<Record<string, unknown>>(tenantId, 'GET', `${path}${sep}pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`)
    out.push(...((r[key] as T[]) || []))
    token = typeof r.nextPageToken === 'string' ? r.nextPageToken : ''
    if (!token) break
  }
  return out
}

const courseIdOk = (id: unknown): id is string => typeof id === 'string' && /^[0-9]{1,30}$/.test(id)

export async function listCourses(tenantId: string) {
  const courses = await paged<{ id: string; name: string; section?: string; enrollmentCode?: string }>(tenantId, '/courses?teacherId=me&courseStates=ACTIVE', 'courses', 300)
  const counts = await (await rostersCol()).aggregate<{ _id: string; n: number }>([{ $match: { tenant_id: tenantId } }, { $group: { _id: '$course_id', n: { $sum: 1 } } }]).toArray()
  const n = new Map(counts.map((c) => [c._id, c.n]))
  return courses.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null, imported: n.get(c.id) ?? 0 }))
}

export async function importRoster(tenantId: string, courseId: unknown) {
  if (!courseIdOk(courseId)) throw fail('Pick a course.', 400, 'classroom_pick_course')
  const students = await paged<{ userId: string; profile?: { emailAddress?: string; name?: { fullName?: string } } }>(tenantId, `/courses/${courseId}/students`, 'students', 5000)
  const col = await rostersCol()
  const now = nowIso()
  const rows = students.filter((s) => s.userId && s.profile?.emailAddress)
  if (rows.length) {
    await col.bulkWrite(rows.map((s) => ({
      updateOne: {
        filter: { tenant_id: tenantId, course_id: courseId, google_user_id: s.userId },
        update: { $set: { email: String(s.profile!.emailAddress).toLowerCase().slice(0, 200), name: String(s.profile?.name?.fullName || '').slice(0, 120), updated_at: now } },
        upsert: true,
      },
    })), { ordered: false })
  }
  return { imported: rows.length, without_email: students.length - rows.length }
}

export async function roster(tenantId: string, courseId: unknown) {
  if (!courseIdOk(courseId)) throw fail('Pick a course.', 400, 'classroom_pick_course')
  return (await rostersCol()).find({ tenant_id: tenantId, course_id: courseId }, { projection: { _id: 0, email: 1, name: 1 } }).sort({ name: 1 }).limit(5000).toArray()
}

async function examOf(tenantId: string, examId: unknown) {
  if (typeof examId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(examId)) throw fail('Pick a test.', 400, 'classroom_pick_exam')
  const exam = await (await getMongoDb()).collection('exams').findOne({ id: examId, ...(tenantId === 'platform' ? {} : { tenant_id: tenantId }) }, { projection: { _id: 0, id: 1, title: 1, end_date: 1, ends_at: 1 } })
  if (!exam) throw fail('Pick a test.', 400, 'classroom_pick_exam')
  return exam
}

export async function postAssignment(tenantId: string, userId: string, raw: Record<string, unknown>) {
  const courseId = raw.course_id
  if (!courseIdOk(courseId)) throw fail('Pick a course.', 400, 'classroom_pick_course')
  const exam = await examOf(tenantId, raw.exam_id)
  const maxPoints = Math.round(Number(raw.max_points) || 100)
  if (!(maxPoints >= 1 && maxPoints <= 1000)) throw fail('Points must be 1 to 1000.', 400, 'classroom_points')
  const title = String(raw.title || exam.title || 'CodeSpectra test').replace(/\s+/g, ' ').trim().slice(0, 300)
  const due = typeof raw.due_at === 'string' && Number.isFinite(Date.parse(raw.due_at)) ? new Date(raw.due_at).toISOString() : null
  const url = await ensureIntegrationLink(String(exam.id), `classroom:${tenantId}:${courseId}`, userId)
  const course = await api<{ name?: string }>(tenantId, 'GET', `/courses/${courseId}`)
  const cw = await api<{ id: string }>(tenantId, 'POST', `/courses/${courseId}/courseWork`, courseWorkBody({
    title, url, maxPoints, due,
    description: `Take this test on CodeSpectra with your school email. Your result is copied here as a grade when it is released.\n${url}`,
  }))
  const doc: LinkDoc = { id: `cl_${randomBytes(8).toString('hex')}`, tenant_id: tenantId, course_id: courseId, course_name: String(course.name || ''), coursework_id: String(cw.id), exam_id: String(exam.id), exam_title: String(exam.title || title), max_points: maxPoints, created_by: userId, created_at: nowIso(), last_sync_at: null, last_synced: 0 }
  await (await linksCol()).insertOne(doc)
  return doc
}

export async function listLinks(tenantId: string) {
  return (await linksCol()).find({ tenant_id: tenantId }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
}

/** Write released results back as Classroom grades (only changed grades are sent). */
export async function syncGrades(tenantId: string, linkId: string, onlyEmail?: string | null) {
  const link = await (await linksCol()).findOne({ id: linkId, tenant_id: tenantId }, { projection: { _id: 0 } })
  if (!link) throw fail('Assignment link not found', 404, 'classroom_link_missing')
  const roster = await (await rostersCol()).find({ tenant_id: tenantId, course_id: link.course_id, ...(onlyEmail ? { email: onlyEmail } : {}) }, { projection: { _id: 0, google_user_id: 1, email: 1 } }).limit(5000).toArray()
  if (!roster.length) return { updated: 0, roster: 0 }
  const emails = roster.map((r) => r.email)
  const subs = await (await getMongoDb()).collection('exam_submissions').find({ exam_id: link.exam_id, score_released: true, email: { $in: emails } }, { projection: { _id: 0, email: 1, score: 1, max_score: 1, score_released: 1 } }).limit(20_000).toArray()
  const percents = bestPercentByEmail(subs as Parameters<typeof bestPercentByEmail>[0])
  if (!percents.size) return { updated: 0, roster: roster.length }
  const submissions = await paged<{ id: string; userId: string; assignedGrade?: number }>(tenantId, `/courses/${link.course_id}/courseWork/${link.coursework_id}/studentSubmissions`, 'studentSubmissions', 5000)
  const patches = gradePatches({ submissions, rosterEmails: new Map(roster.map((r) => [r.google_user_id, r.email])), percents, maxPoints: link.max_points })
  let updated = 0
  for (const p of patches) {
    await api(tenantId, 'PATCH', `/courses/${link.course_id}/courseWork/${link.coursework_id}/studentSubmissions/${encodeURIComponent(p.submissionId)}?updateMask=assignedGrade,draftGrade`, { assignedGrade: p.grade, draftGrade: p.grade })
    updated++
  }
  await (await linksCol()).updateOne({ id: linkId }, { $set: { last_sync_at: nowIso() }, $inc: { last_synced: updated } })
  return { updated, roster: roster.length }
}

/** After a result is released: sync that learner in every Classroom assignment for the test. Never throws. */
export async function syncAfterRelease(examId: string, email: string | null | undefined): Promise<void> {
  if (!email) return
  try {
    const links = await (await linksCol()).find({ exam_id: examId }, { projection: { _id: 0, id: 1, tenant_id: 1 } }).limit(20).toArray()
    for (const l of links) await syncGrades(l.tenant_id, l.id, email.toLowerCase()).catch((e) => console.error('[classroom] sync failed', (e as Error)?.message))
  } catch (e) {
    console.error('[classroom] sync failed', (e as Error)?.message)
  }
}
