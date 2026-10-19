/**
 * ATS interviews (lib/ats/interviews): slot computation, pass rules, provider
 * request builders (no network — fetch is mocked), signed tokens / encryption,
 * and the view/schedule access rules.
 */
import { describe, expect, it, vi } from 'vitest'
import { computeSlots, isOfferedSlot, mergeBusy } from '@/lib/ats/interviews/slots'
import { zonedTimeToUtc, tzOffsetMs, isValidTimeZone } from '@/lib/ats/interviews/tz'
import { decidePanel, parseScorecard, type Scorecard } from '@/lib/ats/interviews/pass-rules'
import { decryptWithKey, encryptWithKey, signToken, verifyToken } from '@/lib/ats/interviews/tokens'
import { buildZoomCancel, buildZoomCreate, zoomProvider, zoomTime } from '@/lib/ats/interviews/providers/zoom'
import { buildGoogleCancel, buildGoogleCreate, googleJoinUrl, googleMeetProvider } from '@/lib/ats/interviews/providers/google-meet'
import { buildTeamsCancel, buildTeamsCreate, teamsProvider } from '@/lib/ats/interviews/providers/teams'
import { manualProvider } from '@/lib/ats/interviews/providers/manual'
import { livekitProvider } from '@/lib/ats/interviews/providers/livekit'
import type { MeetingInput, ProviderContext } from '@/lib/ats/interviews/providers/types'
import {
  buildCodeExchange, buildGoogleAuthUrl, buildMicrosoftAuthUrl, buildRefresh, buildZoomTokenRequest, idTokenEmail, GOOGLE_SCOPES, MICROSOFT_SCOPES,
} from '@/lib/ats/interviews/integrations'
import { canScheduleInterview, canSeeAllScorecards, canViewInterview } from '@/lib/ats/interviews/access'
import type { AtsActor } from '@/lib/ats/contract'

// ─── Time zones & slots ──────────────────────────────────────────────────────

describe('tz helpers', () => {
  it('converts wall time to UTC (fixed and DST zones)', () => {
    expect(zonedTimeToUtc(2026, 10, 19, 9, 0, 'Asia/Kolkata').toISOString()).toBe('2026-10-19T03:30:00.000Z')
    // New York: EDT (UTC-4) in October, EST (UTC-5) in December
    expect(zonedTimeToUtc(2026, 10, 19, 9, 0, 'America/New_York').toISOString()).toBe('2026-10-19T13:00:00.000Z')
    expect(zonedTimeToUtc(2026, 12, 7, 9, 0, 'America/New_York').toISOString()).toBe('2026-12-07T14:00:00.000Z')
    expect(tzOffsetMs(new Date('2026-10-19T00:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * 3_600_000)
  })
  it('validates zone names', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(isValidTimeZone(42)).toBe(false)
  })
})

describe('computeSlots', () => {
  // Monday 19 Oct 2026, 06:00 IST
  const now = new Date('2026-10-19T00:30:00Z')
  const base = { now, timeZone: 'Asia/Kolkata', durationMin: 60, busy: [], minNoticeHours: 0, days: 0 }

  it('offers 30-minute starts inside 9–18 on a weekday, ending by 18:00', () => {
    const s = computeSlots(base)
    expect(s[0].start).toBe('2026-10-19T03:30:00.000Z') // 09:00 IST
    expect(s[s.length - 1].start).toBe('2026-10-19T11:30:00.000Z') // 17:00 IST (ends 18:00)
    expect(s).toHaveLength(17)
    expect(s.every((x) => Date.parse(x.end) - Date.parse(x.start) === 3_600_000)).toBe(true)
  })

  it('removes slots overlapping any panel member’s busy time', () => {
    const busy = [{ start: '2026-10-19T04:30:00Z', end: '2026-10-19T05:30:00Z' }] // 10:00–11:00 IST
    const starts = computeSlots({ ...base, busy }).map((x) => x.start)
    expect(starts).toContain('2026-10-19T03:30:00.000Z') // 09:00–10:00 touches but doesn't overlap
    expect(starts).not.toContain('2026-10-19T04:00:00.000Z') // 09:30
    expect(starts).not.toContain('2026-10-19T04:30:00.000Z') // 10:00
    expect(starts).not.toContain('2026-10-19T05:00:00.000Z') // 10:30
    expect(starts).toContain('2026-10-19T05:30:00.000Z') // 11:00
  })

  it('respects minimum notice and skips weekends', () => {
    // Friday 23 Oct 2026 16:00 IST, 12h notice → nothing Friday, nothing Sat/Sun, Monday from 09:00
    const fri = new Date('2026-10-23T10:30:00Z')
    const s = computeSlots({ now: fri, timeZone: 'Asia/Kolkata', durationMin: 45, busy: [], days: 4 })
    expect(s[0].start).toBe('2026-10-26T03:30:00.000Z')
    expect(new Set(s.map((x) => x.start.slice(0, 10)))).toEqual(new Set(['2026-10-26', '2026-10-27']))
  })

  it('uses custom working hours and caps the count', () => {
    const s = computeSlots({ ...base, workStartHour: 10, workEndHour: 12, durationMin: 30, maxSlots: 3 })
    expect(s.map((x) => x.start)).toEqual(['2026-10-19T04:30:00.000Z', '2026-10-19T05:00:00.000Z', '2026-10-19T05:30:00.000Z'])
  })

  it('merges busy intervals and matches offered slots exactly', () => {
    expect(mergeBusy([{ start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' }, { start: '2026-01-01T10:30:00Z', end: '2026-01-01T12:00:00Z' }, { start: 'x', end: 'y' }]))
      .toEqual([[Date.parse('2026-01-01T10:00:00Z'), Date.parse('2026-01-01T12:00:00Z')]])
    const slots = computeSlots(base)
    expect(isOfferedSlot(slots, '2026-10-19T03:30:00Z')).not.toBeNull()
    expect(isOfferedSlot(slots, '2026-10-19T03:31:00Z')).toBeNull()
  })
})

// ─── Pass rules ──────────────────────────────────────────────────────────────

const card = (id: string, recommendation: Scorecard['recommendation'], ratings: Record<string, number> = {}): Scorecard =>
  ({ interviewer_id: id, recommendation, ratings, submitted_at: '2026-10-19T10:00:00Z' })

describe('decidePanel', () => {
  it('all_yes needs every card to be yes', () => {
    expect(decidePanel([card('a', 'yes'), card('b', 'strong_yes')], 'all_yes')?.outcome).toBe('pass')
    expect(decidePanel([card('a', 'yes'), card('b', 'no')], 'all_yes')?.outcome).toBe('fail')
  })
  it('majority_yes needs more than half', () => {
    expect(decidePanel([card('a', 'yes'), card('b', 'no')], 'majority_yes')?.outcome).toBe('fail')
    expect(decidePanel([card('a', 'yes'), card('b', 'yes'), card('c', 'strong_no')], 'majority_yes')?.outcome).toBe('pass')
  })
  it('avg_score compares the mean rating with pass_score (default 3.5)', () => {
    const cards = [card('a', 'no', { tech: 4, comm: 3 }), card('b', 'yes', { tech: 4, comm: 4 })] // mean 3.75
    expect(decidePanel(cards, 'avg_score')?.outcome).toBe('pass')
    expect(decidePanel(cards, 'avg_score', 4)?.outcome).toBe('fail')
    expect(decidePanel([card('a', 'yes')], 'avg_score')?.outcome).toBe('fail') // no ratings
  })
  it('normalises the score to 0–100', () => {
    expect(decidePanel([card('a', 'yes', { x: 5 })], 'majority_yes')?.score).toBe(100)
    expect(decidePanel([card('a', 'yes', { x: 3 })], 'majority_yes')?.score).toBe(50)
    expect(decidePanel([card('a', 'yes'), card('b', 'no')], 'majority_yes')?.score).toBe(50)
    expect(decidePanel([], 'majority_yes')).toBeNull()
  })
})

describe('parseScorecard', () => {
  const tpl = { criteria: [{ id: 'tech', label: 'Technical' }, { id: 'comm', label: 'Communication' }] }
  it('accepts a complete card and trims notes', () => {
    const r = parseScorecard({ ratings: { tech: 4, comm: '5', extra: 1 }, recommendation: 'yes', notes: '  good  ' }, tpl)
    expect(r).toEqual({ ok: true, ratings: { tech: 4, comm: 5 }, recommendation: 'yes', notes: 'good' })
  })
  it('rejects missing / out-of-range ratings and bad recommendations', () => {
    expect(parseScorecard({ ratings: { tech: 4 }, recommendation: 'yes' }, tpl).ok).toBe(false)
    expect(parseScorecard({ ratings: { tech: 6, comm: 3 }, recommendation: 'yes' }, tpl).ok).toBe(false)
    expect(parseScorecard({ ratings: { tech: 2.5, comm: 3 }, recommendation: 'yes' }, tpl).ok).toBe(false)
    expect(parseScorecard({ ratings: { tech: 3, comm: 3 }, recommendation: 'maybe' }, tpl).ok).toBe(false)
    expect(parseScorecard(null, tpl).ok).toBe(false)
  })
})

// ─── Tokens & encryption ─────────────────────────────────────────────────────

describe('signed tokens', () => {
  const key = new Uint8Array(32).fill(7)
  const other = new Uint8Array(32).fill(8)
  const p = { k: 'join' as const, i: 'iv1', n: 'nonce', e: Date.now() + 60_000 }

  it('round-trips and checks kind, key, tampering and expiry', () => {
    const t = signToken(key, p)
    expect(verifyToken(key, t, 'join')).toMatchObject({ i: 'iv1', n: 'nonce' })
    expect(verifyToken(key, t, 'sched')).toBeNull()
    expect(verifyToken(other, t, 'join')).toBeNull()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ ...p, i: 'iv2' })).toString('base64url')
    expect(verifyToken(key, `${forged}.${sig}`, 'join')).toBeNull()
    expect(verifyToken(key, `${body}.${sig}x`, 'join')).toBeNull()
    expect(verifyToken(key, signToken(key, { ...p, e: Date.now() - 1 }), 'join')).toBeNull()
    expect(verifyToken(key, 'not a token', 'join')).toBeNull()
    expect(verifyToken(key, undefined, 'join')).toBeNull()
  })

  it('carries oauth state fields', () => {
    const t = signToken(key, { k: 'oauth', i: 'google_meet', n: 'x', e: Date.now() + 1000, t: 'tenant-1', u: 'user-1', p: 'own' })
    expect(verifyToken(key, t, 'oauth')).toMatchObject({ t: 'tenant-1', u: 'user-1', p: 'own' })
  })
})

describe('credential encryption', () => {
  const key = new Uint8Array(32).fill(3)
  it('round-trips and rejects tampering or the wrong key', () => {
    const box = encryptWithKey(key, '{"refresh_token":"abc"}')
    expect(box.startsWith('v1.')).toBe(true)
    expect(box).not.toContain('abc')
    expect(decryptWithKey(key, box)).toBe('{"refresh_token":"abc"}')
    expect(decryptWithKey(new Uint8Array(32).fill(4), box)).toBeNull()
    const raw = Buffer.from(box.slice(3), 'base64url')
    raw[raw.length - 1] ^= 1
    expect(decryptWithKey(key, 'v1.' + raw.toString('base64url'))).toBeNull()
    expect(encryptWithKey(key, 'same')).not.toBe(encryptWithKey(key, 'same')) // random IV
  })
})

// ─── Provider request builders ───────────────────────────────────────────────

const input: MeetingInput = {
  interviewId: 'iv1',
  title: 'Interview: Engineer — Asha',
  description: 'Video interview\nPanel: Ravi',
  start: '2026-10-20T04:30:00.000Z',
  durationMin: 45,
  timeZone: 'Asia/Kolkata',
  attendees: [{ email: 'asha@example.com', name: 'Asha' }, { email: 'ravi@corp.test' }],
}

function ctxWith(fetchImpl: (url: string, init: RequestInit) => Promise<Response>): ProviderContext & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  return {
    tenantId: 't1',
    origin: 'https://app.test',
    getAccessToken: async () => 'tok',
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return fetchImpl(url, init) }) as unknown as typeof fetch,
    calls,
  }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('zoom', () => {
  it('builds create / cancel requests', () => {
    expect(zoomTime('2026-10-20T04:30:00.000Z')).toBe('2026-10-20T04:30:00Z')
    const r = buildZoomCreate(input)
    expect(r).toMatchObject({ method: 'POST', url: 'https://api.zoom.us/v2/users/me/meetings' })
    expect(r.body).toMatchObject({ type: 2, start_time: '2026-10-20T04:30:00Z', duration: 45, timezone: 'Asia/Kolkata', settings: { waiting_room: true, join_before_host: false } })
    expect(buildZoomCancel('123').method).toBe('DELETE')
  })
  it('creates a meeting with a bearer token and maps the response', async () => {
    const ctx = ctxWith(async () => json({ id: 987, join_url: 'https://zoom.us/j/987', start_url: 'https://zoom.us/s/987' }, 201))
    const res = await zoomProvider.createMeeting(ctx, input)
    expect(res).toEqual({ join_url: 'https://zoom.us/j/987', meeting_id: '987', host_url: 'https://zoom.us/s/987' })
    expect((ctx.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
  it('surfaces API errors', async () => {
    const ctx = ctxWith(async () => json({ message: 'Invalid access token' }, 401))
    await expect(zoomProvider.createMeeting(ctx, input)).rejects.toMatchObject({ code: 'auth', status: 401 })
  })
  it('builds the S2S token request with Basic auth', () => {
    const r = buildZoomTokenRequest({ account_id: 'acc 1', client_id: 'id', client_secret: 'sec' })
    expect(r.url).toBe('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=acc%201')
    expect(r.headers.Authorization).toBe(`Basic ${Buffer.from('id:sec').toString('base64')}`)
  })
})

describe('google meet', () => {
  it('asks for a Meet conference and emails attendees', () => {
    const r = buildGoogleCreate(input)
    expect(r.url).toContain('conferenceDataVersion=1')
    expect(r.url).toContain('sendUpdates=all')
    const b = r.body as Record<string, any>
    expect(b.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
    expect(b.start).toEqual({ dateTime: '2026-10-20T04:30:00.000Z', timeZone: 'Asia/Kolkata' })
    expect(b.end.dateTime).toBe('2026-10-20T05:15:00.000Z')
    expect(b.attendees).toEqual([{ email: 'asha@example.com', displayName: 'Asha' }, { email: 'ravi@corp.test' }])
    expect(buildGoogleCancel('ev1')).toEqual({ method: 'DELETE', url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1?sendUpdates=all' })
  })
  it('reads the join link from hangoutLink or entry points', async () => {
    expect(googleJoinUrl({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://meet.google.com/abc' }] } })).toBe('https://meet.google.com/abc')
    const ctx = ctxWith(async () => json({ id: 'ev1', hangoutLink: 'https://meet.google.com/xyz' }))
    expect(await googleMeetProvider.createMeeting(ctx, input)).toMatchObject({ join_url: 'https://meet.google.com/xyz', meeting_id: 'ev1' })
  })
  it('builds the OAuth URL with offline access and calendar.events', () => {
    const url = new URL(buildGoogleAuthUrl({ client_id: 'cid', client_secret: 's' }, 'https://app.test/cb', 'st'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '))
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.events')
    expect(url.searchParams.get('state')).toBe('st')
    const ex = buildCodeExchange('google', { client_id: 'cid', client_secret: 's' }, 'code1', 'https://app.test/cb')
    expect(Object.fromEntries(ex)).toMatchObject({ grant_type: 'authorization_code', code: 'code1', redirect_uri: 'https://app.test/cb' })
  })
})

describe('microsoft teams', () => {
  it('creates an online Teams meeting event in UTC', () => {
    const b = buildTeamsCreate(input).body as Record<string, any>
    expect(b.isOnlineMeeting).toBe(true)
    expect(b.onlineMeetingProvider).toBe('teamsForBusiness')
    expect(b.start).toEqual({ dateTime: '2026-10-20T04:30:00.000', timeZone: 'UTC' })
    expect(b.attendees[0]).toEqual({ emailAddress: { address: 'asha@example.com', name: 'Asha' }, type: 'required' })
    expect(b.body.content).toBe('Video interview<br/>Panel: Ravi')
    expect(buildTeamsCancel('e1')).toMatchObject({ method: 'POST', url: 'https://graph.microsoft.com/v1.0/me/events/e1/cancel' })
  })
  it('maps the Graph response', async () => {
    const ctx = ctxWith(async () => json({ id: 'e1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/1' } }, 201))
    expect(await teamsProvider.createMeeting(ctx, input)).toMatchObject({ join_url: 'https://teams.microsoft.com/l/meetup-join/1', meeting_id: 'e1' })
    const bad = ctxWith(async () => json({ id: 'e1', onlineMeeting: null }, 201))
    await expect(teamsProvider.createMeeting(bad, input)).rejects.toThrow(/Teams link/)
  })
  it('builds the OAuth URLs with delegated scopes and refresh', () => {
    const url = new URL(buildMicrosoftAuthUrl({ client_id: 'cid', client_secret: 's', ms_tenant: 'contoso.onmicrosoft.com' }, 'https://app.test/cb', 'st'))
    expect(url.pathname).toBe('/contoso.onmicrosoft.com/oauth2/v2.0/authorize')
    for (const s of ['offline_access', 'Calendars.ReadWrite', 'OnlineMeetings.ReadWrite']) expect(url.searchParams.get('scope')).toContain(s)
    expect(url.searchParams.get('scope')).toBe(MICROSOFT_SCOPES.join(' '))
    const r = Object.fromEntries(buildRefresh('microsoft', { client_id: 'cid', client_secret: 's' }, 'rt'))
    expect(r).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'rt' })
    expect(r.scope).toContain('offline_access')
  })
  it('reads the account email from an id_token', () => {
    const tok = `x.${Buffer.from(JSON.stringify({ email: 'hr@contoso.com' })).toString('base64url')}.y`
    expect(idTokenEmail(tok)).toBe('hr@contoso.com')
    expect(idTokenEmail('garbage')).toBeNull()
  })
})

describe('manual and built-in providers', () => {
  const ctx = ctxWith(async () => json({}))
  it('manual accepts only https links', async () => {
    await expect(manualProvider.createMeeting(ctx, { ...input, manualUrl: 'http://meet.test/1' })).rejects.toThrow(/https/)
    await expect(manualProvider.createMeeting(ctx, { ...input, manualUrl: 'javascript:alert(1)' })).rejects.toThrow()
    expect((await manualProvider.createMeeting(ctx, { ...input, manualUrl: 'https://meet.test/1' })).join_url).toBe('https://meet.test/1')
  })
  it('livekit gives the panel room page, never a candidate link, and calls nothing', async () => {
    const r = await livekitProvider.createMeeting(ctx, input)
    expect(r).toEqual({ join_url: 'https://app.test/dashboard/hiring/interviews/iv1/live', meeting_id: 'ats-interview-iv1', host_url: 'https://app.test/dashboard/hiring/interviews/iv1/live' })
    expect(ctx.calls).toHaveLength(0)
  })
})

// ─── Access ──────────────────────────────────────────────────────────────────

describe('interview access', () => {
  const actor = (role: AtsActor['role'], userId = 'u1', tenantId = 't1'): AtsActor => ({ role, userId, tenantId, clientId: role === 'client' ? 'c1' : null, email: `${userId}@x.test` })
  const job = { tenant_id: 't1', client_id: 'c1', recruiter_ids: ['rec'], hiring_manager_ids: ['hm'] }
  const iv = { tenant_id: 't1', panel: [{ user_id: 'int', email: 'int@x.test' }], scorecards: [] as Scorecard[] }

  it('panel members see their interview; other interviewers and clients do not', () => {
    expect(canViewInterview(actor('interviewer', 'int'), iv, job)).toBe(true)
    expect(canViewInterview(actor('interviewer', 'other'), iv, job)).toBe(false)
    expect(canViewInterview(actor('client', 'cl'), iv, job)).toBe(false)
    expect(canViewInterview(actor('hiring_manager', 'hm'), iv, job)).toBe(true)
    expect(canViewInterview(actor('hiring_manager', 'nope'), iv, job)).toBe(false)
    expect(canViewInterview(actor('admin', 'a', 't2'), iv, job)).toBe(false) // other tenant
  })
  it('only admins and recruiters schedule', () => {
    expect(canScheduleInterview(actor('recruiter', 'rec'), iv, job)).toBe(true)
    expect(canScheduleInterview(actor('admin', 'a'), iv, job)).toBe(true)
    expect(canScheduleInterview(actor('hiring_manager', 'hm'), iv, job)).toBe(false)
    expect(canScheduleInterview(actor('interviewer', 'int'), iv, job)).toBe(false)
    expect(canScheduleInterview(actor('admin', 'a'), iv, null)).toBe(false)
  })
  it('interviewers see the others’ scorecards only after submitting their own', () => {
    expect(canSeeAllScorecards(actor('interviewer', 'int'), iv, job)).toBe(false)
    expect(canSeeAllScorecards(actor('interviewer', 'int'), { ...iv, scorecards: [card('int', 'yes')] }, job)).toBe(true)
    expect(canSeeAllScorecards(actor('recruiter', 'rec'), iv, job)).toBe(true)
  })
})

vi.restoreAllMocks()
