import { describe, expect, it } from 'vitest'
import {
  assignGroups, canActOn, cleanAnswerPatch, countByStatus, deadlineMs, DEFAULT_RULES, effectiveStatus, gridStatus,
  isReconnect, joinWindow, nextPollDelay, passMark, reconnectAllowed, remainingMs, seededOrder, sessionSchema,
  shouldWriteHeartbeat, systemVerdict, timeUp, actionSchema, createDriveSchema,
} from '@/lib/live-drives/types'

const T0 = Date.parse('2026-11-01T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const drive = (over: Partial<{ status: 'draft' | 'scheduled' | 'ended' }> = {}) => ({
  status: over.status ?? ('scheduled' as const),
  schedule: { start_at: iso(T0), duration_min: 60, lobby_open_min: 30, late_join_min: 15 },
})
const clock = (o: Partial<{ started_at: string | null; extra_ms: number; paused_ms: number; paused_at: string | null }> = {}) => ({
  started_at: iso(T0), extra_ms: 0, paused_ms: 0, paused_at: null, ...o,
})

describe('drive windows', () => {
  it('effective status turns live at the start', () => {
    expect(effectiveStatus(drive(), T0 - 1)).toBe('scheduled')
    expect(effectiveStatus(drive(), T0)).toBe('live')
    expect(effectiveStatus(drive({ status: 'draft' }), T0)).toBe('draft')
    expect(effectiveStatus(drive({ status: 'ended' }), T0)).toBe('ended')
  })
  it('join window: too early → lobby → open → closed', () => {
    expect(joinWindow(drive(), T0 - 31 * 60_000)).toBe('too_early')
    expect(joinWindow(drive(), T0 - 29 * 60_000)).toBe('lobby')
    expect(joinWindow(drive(), T0)).toBe('open')
    expect(joinWindow(drive(), T0 + 15 * 60_000)).toBe('open')
    expect(joinWindow(drive(), T0 + 15 * 60_000 + 1)).toBe('closed')
    expect(joinWindow(drive({ status: 'draft' }), T0)).toBe('draft')
  })
})

describe('candidate clock', () => {
  it('deadline = start + duration + added + paused', () => {
    expect(deadlineMs(clock(), 60, T0)).toBe(T0 + 3600_000)
    expect(deadlineMs(clock({ extra_ms: 300_000, paused_ms: 60_000 }), 60, T0)).toBe(T0 + 3600_000 + 360_000)
    expect(deadlineMs(clock({ started_at: null }), 60, T0)).toBeNull()
  })
  it('a running pause keeps pushing the deadline out', () => {
    const c = clock({ paused_at: iso(T0 + 10 * 60_000) })
    expect(deadlineMs(c, 60, T0 + 20 * 60_000)).toBe(T0 + 3600_000 + 10 * 60_000)
    expect(remainingMs(c, 60, T0 + 20 * 60_000)).toBe(50 * 60_000)
  })
  it('time is up only after the grace, and only while writing', () => {
    const c = { ...clock(), state: 'in_progress' as const }
    expect(timeUp(c, 60, T0 + 3600_000 + 29_000)).toBe(false)
    expect(timeUp(c, 60, T0 + 3600_000 + 31_000)).toBe(true)
    expect(timeUp({ ...c, state: 'paused' }, 60, T0 + 9e9)).toBe(false)
  })
})

describe('grid status', () => {
  const rules = { heartbeat_sec: 15, flag_threshold: 5 }
  const base = { state: 'in_progress' as const, last_seen_at: new Date(T0), flagged: null, flag_count: 0 }
  it('derives each status', () => {
    expect(gridStatus(base, rules, T0 + 10_000)).toBe('in_progress')
    expect(gridStatus(base, rules, T0 + 46_000)).toBe('disconnected')
    expect(gridStatus({ ...base, last_seen_at: null }, rules, T0)).toBe('disconnected')
    expect(gridStatus({ ...base, flag_count: 5 }, rules, T0)).toBe('flagged')
    expect(gridStatus({ ...base, flagged: { by: 'u', reason: 'x', at: iso(T0) } }, rules, T0)).toBe('flagged')
    expect(gridStatus({ ...base, flag_count: 99 }, { ...rules, flag_threshold: 0 }, T0)).toBe('in_progress')
    expect(gridStatus({ ...base, state: 'paused' }, rules, T0 + 9e6)).toBe('paused')
    expect(gridStatus({ ...base, state: 'submitted', flag_count: 99 }, rules, T0)).toBe('submitted')
    expect(gridStatus({ ...base, state: 'terminated' }, rules, T0)).toBe('terminated')
    expect(gridStatus({ ...base, state: 'not_started' }, rules, T0)).toBe('not_started')
  })
  it('counts every status', () => {
    const c = countByStatus(['in_progress', 'in_progress', 'flagged'])
    expect(c.in_progress).toBe(2)
    expect(c.flagged).toBe(1)
    expect(c.submitted).toBe(0)
  })
})

describe('reconnect', () => {
  const rules = { reconnect_window_min: 10 }
  const c = { state: 'in_progress' as const, last_seen_at: new Date(T0), rejoin_allowed_at: null }
  it('resumes inside the window, locks after, unlocks with a rejoin', () => {
    expect(reconnectAllowed(c, rules, T0 + 9 * 60_000)).toBe(true)
    expect(reconnectAllowed(c, rules, T0 + 11 * 60_000)).toBe(false)
    expect(reconnectAllowed({ ...c, rejoin_allowed_at: iso(T0 + 60_000) }, rules, T0 + 11 * 60_000)).toBe(true)
    expect(reconnectAllowed({ ...c, state: 'submitted' }, rules, T0 + 9e9)).toBe(true)
  })
  it('detects a reconnect and throttles heartbeat writes', () => {
    expect(isReconnect(new Date(T0), 15, T0 + 46_000)).toBe(true)
    expect(isReconnect(new Date(T0), 15, T0 + 20_000)).toBe(false)
    expect(isReconnect(null, 15, T0)).toBe(false)
    expect(shouldWriteHeartbeat(new Date(T0), T0 + 5_000)).toBe(false)
    expect(shouldWriteHeartbeat(new Date(T0), T0 + 10_000)).toBe(true)
    expect(shouldWriteHeartbeat(null, T0)).toBe(true)
  })
})

describe('groups and access', () => {
  it('splits into groups of N and shares groups round-robin', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `c${i}`)
    const plan = assignGroups(ids, ['a', 'b'], 50)
    expect(plan.get('c0')).toEqual({ group_no: 1, invigilator_id: 'a' })
    expect(plan.get('c49')).toEqual({ group_no: 1, invigilator_id: 'a' })
    expect(plan.get('c50')).toEqual({ group_no: 2, invigilator_id: 'b' })
    expect(plan.get('c119')).toEqual({ group_no: 3, invigilator_id: 'a' })
    expect(assignGroups(['x'], [], 50).get('x')).toEqual({ group_no: 1, invigilator_id: null })
  })
  it('invigilators act only on their own groups', () => {
    expect(canActOn('owner', 'u1', { invigilator_id: 'u2' })).toBe(true)
    expect(canActOn('invigilator', 'u1', { invigilator_id: 'u1' })).toBe(true)
    expect(canActOn('invigilator', 'u1', { invigilator_id: 'u2' })).toBe(false)
  })
})

describe('system check, polling, answers', () => {
  it('system check verdict', () => {
    const ok = { camera: true, mic: true, mbps: 5, browser_ok: true }
    expect(systemVerdict(ok, { camera: true, min_mbps: 1 })).toEqual({ passed: true, failures: [] })
    expect(systemVerdict({ ...ok, camera: false }, { camera: true, min_mbps: 1 }).failures).toEqual(['camera'])
    expect(systemVerdict({ ...ok, camera: false }, { camera: false, min_mbps: 1 }).passed).toBe(true)
    expect(systemVerdict({ ...ok, mbps: 0.5, browser_ok: false }, { camera: false, min_mbps: 1 }).failures).toEqual(['browser', 'network'])
    expect(systemVerdict({ ...ok, mbps: null }, { camera: false, min_mbps: 1 }).passed).toBe(true)
  })
  it('backs off exponentially, capped, slower when hidden', () => {
    expect(nextPollDelay(5000, 0)).toBe(5000)
    expect(nextPollDelay(5000, 2)).toBe(20000)
    expect(nextPollDelay(5000, 10)).toBe(60000)
    expect(nextPollDelay(5000, 0, { hidden: true })).toBe(15000)
    expect(nextPollDelay(5000, 0, { jitter: 0.2 })).toBe(6000)
  })
  it('keeps only answers to questions on the paper', () => {
    const ids = new Set(['q1', 'q2'])
    expect(cleanAnswerPatch({ q1: 'A', q2: ['x', 'y'], q3: 'no', $where: '1', 'a.b': 'x' }, ids)).toEqual({ q1: 'A', q2: 'x, y' })
    expect(cleanAnswerPatch({ q1: 'z'.repeat(30) }, ids, 10).q1).toHaveLength(10)
    expect(cleanAnswerPatch(null, ids)).toEqual({})
  })
  it('per-candidate order is stable and a permutation', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const one = seededOrder(items, 'drive:user1')
    expect(seededOrder(items, 'drive:user1')).toEqual(one)
    expect([...one].sort()).toEqual(items)
  })
  it('pass mark falls back to the pattern cut-off', () => {
    expect(passMark({ pass_percent: null }, 60)).toBe(60)
    expect(passMark({ pass_percent: 45 }, 60)).toBe(45)
    expect(DEFAULT_RULES.group_size).toBe(50)
  })
})

describe('schemas', () => {
  it('validates session ops and actions', () => {
    expect(sessionSchema.safeParse({ op: 'save', seq: 3, answers: { q1: 'A' } }).success).toBe(true)
    expect(sessionSchema.safeParse({ op: 'save', answers: {} }).success).toBe(false)
    expect(sessionSchema.safeParse({ op: 'nuke' }).success).toBe(false)
    expect(actionSchema.safeParse({ action: 'terminate', reason: 'no' }).success).toBe(false)
    expect(actionSchema.safeParse({ action: 'terminate', reason: 'Phone in use' }).success).toBe(true)
    expect(actionSchema.safeParse({ action: 'add_time', minutes: 90 }).success).toBe(false)
  })
  it('validates drive creation', () => {
    const ok = { title: 'Campus drive', owner_kind: 'college', pattern_id: 'tcs-nqt', level: 'moderate', schedule: { start_at: iso(T0), duration_min: 90 } }
    expect(createDriveSchema.safeParse(ok).success).toBe(true)
    expect(createDriveSchema.safeParse({ ...ok, pattern_id: 'Bad Id' }).success).toBe(false)
    expect(createDriveSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  })
})
