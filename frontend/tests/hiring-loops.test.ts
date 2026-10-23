/** Hiring agent loops (lib/agent/hiring-loops): settings, budgets and each loop's pure selection / scoring logic. */
import { describe, expect, it } from 'vitest'
import { cleanSettingsPatch, defaultSettings, loopBudget, loopDue, loopWindow, mergeSettings, LOOP_IDS, LOOP_STEPS, STEP_TOOL } from '@/lib/agent/hiring-loops/types'
import { countInvites, funnelStalled, jobsToSource, pickShortlist, type SourcerJobState } from '@/lib/agent/hiring-loops/sourcer'
import { classifyInterview, pickSlots, stillFree, type SchedIv } from '@/lib/agent/hiring-loops/scheduler'
import { bandFor, coverage, evaluateDraft, judgeDryRun, nextStep, refinePlan, specFromJob, structuralIssue, targetMix, type DraftQuestion } from '@/lib/agent/hiring-loops/author'
import { priority, rankCases, recommend, caseFacts, type CaseInput } from '@/lib/agent/hiring-loops/integrity'
import { HL_MESSAGES, evidenceSummary, hlt } from '@/lib/agent/hiring-loops/i18n'

const NOW = new Date('2026-10-23T12:00:00.000Z')
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const ahead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

describe('settings + budget', () => {
  it('defaults: messaging / AI loops off, integrity queue on, auto-send off everywhere', () => {
    expect(defaultSettings('sourcer').enabled).toBe(false)
    expect(defaultSettings('scheduler').enabled).toBe(false)
    expect(defaultSettings('author').enabled).toBe(false)
    expect(defaultSettings('integrity').enabled).toBe(true)
    expect(defaultSettings('integrity').params.ai_summaries).toBe(false)
    for (const l of LOOP_IDS) expect(Object.values(defaultSettings(l).auto_send).every((v) => v === false)).toBe(true)
  })
  it('every step maps to a tool', () => {
    for (const l of LOOP_IDS) for (const s of LOOP_STEPS[l]) expect(STEP_TOOL[s]).toBeTruthy()
  })
  it('validates patches: unknown steps, params and ranges are refused', () => {
    expect(cleanSettingsPatch('sourcer', { auto_send: { send_invites: true } }).ok).toBe(true)
    expect(cleanSettingsPatch('sourcer', { auto_send: { offer_slots: true } }).ok).toBe(false)
    expect(cleanSettingsPatch('sourcer', { params: { stale_hours: 3 } }).ok).toBe(false)
    expect(cleanSettingsPatch('sourcer', { params: { min_match: 101 } }).ok).toBe(false)
    expect(cleanSettingsPatch('author', { monthly_cost_cap_usd: 9999 }).ok).toBe(false)
    expect(cleanSettingsPatch('author', { owner_id: 'x' }).ok).toBe(false)
    const r = cleanSettingsPatch('author', { monthly_cost_cap_usd: '2.345', params: { max_rounds: '3' } })
    expect(r.ok && r.patch.monthly_cost_cap_usd).toBe(2.35)
    expect(r.ok && r.patch.params).toEqual({ max_rounds: 3 })
  })
  it('merges stored docs over defaults and drops junk', () => {
    const s = mergeSettings('scheduler', { enabled: true, params: { max_offers: 3, bogus: 1 }, auto_send: { offer_slots: true, nope: true } })
    expect(s.enabled).toBe(true)
    expect(s.params.max_offers).toBe(3)
    expect(s.params.stale_hours).toBe(24)
    expect(s.auto_send).toEqual({ offer_slots: true, book_requested: false })
    expect(mergeSettings('scheduler', { daily_item_cap: -5 })).toEqual(defaultSettings('scheduler'))
  })
  it('budget: daily cap stops, AI caps only switch AI off', () => {
    const s = { daily_item_cap: 10, monthly_cost_cap_usd: 1 }
    expect(loopBudget(s, 4, 0.2, false)).toEqual({ items: 6, ai: true })
    expect(loopBudget(s, 10, 0, false)).toMatchObject({ items: 0, blocked: 'daily_cap' })
    expect(loopBudget(s, 0, 1, false)).toMatchObject({ items: 10, ai: false, ai_off: 'monthly_cap' })
    expect(loopBudget(s, 0, 0, true)).toMatchObject({ ai: false, ai_off: 'platform_budget' })
  })
  it('due + windows', () => {
    expect(loopDue('sourcer', { enabled: true, run_hour_utc: 13 }, NOW)).toBe(false)
    expect(loopDue('sourcer', { enabled: true, run_hour_utc: 1 }, NOW)).toBe(true)
    expect(loopDue('scheduler', { enabled: false, run_hour_utc: 1 }, NOW)).toBe(false)
    expect(loopWindow('sourcer', NOW)).toBe('2026-10-23')
    expect(loopWindow('scheduler', NOW)).toBe('2026-10-23T12')
    expect(loopWindow('author', new Date('2026-10-23T12:31:00Z'))).toBe('2026-10-23T12q2')
  })
})

const P = { min_match: 60, invites_per_job: 10, stall_days: 7, max_jobs: 10 }
const job = (o: Partial<SourcerJobState>): SourcerJobState => ({ id: 'j', title: 'Job', status: 'open', openings: 1, last_sourced_at: null, recent_applications: 0, hired: 0, invites: { pending: 0, accepted: 0, declined: 0, expired: 0, withdrawn: 0 }, ...o })

describe('sourcer', () => {
  it('stall: invites out ≥ stall days, nobody accepted / pending / applied', () => {
    const stalled = job({ last_sourced_at: ago(24 * 8), invites: { pending: 0, accepted: 0, declined: 3, expired: 2, withdrawn: 0 } })
    expect(funnelStalled(stalled, NOW, 7)).toBe(true)
    expect(funnelStalled({ ...stalled, recent_applications: 1 }, NOW, 7)).toBe(false)
    expect(funnelStalled({ ...stalled, last_sourced_at: ago(24 * 3) }, NOW, 7)).toBe(false)
  })
  it('picks first-time jobs, then stalled (lower bar), then top-ups; skips closed, filled and same-day', () => {
    const plan = jobsToSource([
      job({ id: 'closed', status: 'paused' }),
      job({ id: 'filled', hired: 1 }),
      job({ id: 'today', last_sourced_at: ago(5) }),
      job({ id: 'topup', last_sourced_at: ago(24 * 4), invites: { pending: 0, accepted: 1, declined: 0, expired: 0, withdrawn: 0 }, recent_applications: 2 }),
      job({ id: 'stalled', last_sourced_at: ago(24 * 9), invites: { pending: 0, accepted: 0, declined: 2, expired: 0, withdrawn: 0 } }),
      job({ id: 'new' }),
      job({ id: 'waiting', last_sourced_at: ago(24 * 4), invites: { pending: 3, accepted: 0, declined: 0, expired: 0, withdrawn: 0 } }),
    ], NOW, P)
    expect(plan.map((p) => [p.id, p.mode, p.min_match, p.limit])).toEqual([['new', 'first', 60, 10], ['stalled', 'stalled', 50, 10], ['topup', 'top_up', 60, 5]])
    expect(jobsToSource([job({ id: 'a' }), job({ id: 'b' })], NOW, { ...P, max_jobs: 1 })).toHaveLength(1)
  })
  it('shortlist: threshold, excluded handles, not-looking, dedupe, best first', () => {
    const c = (handle: string, score: number, availability: string | null = 'immediately', matched = 1) => ({ handle, name: handle, availability, match: { score, matched: Array.from({ length: matched }, () => ({ skill: 'python' })), missing: [] } })
    const picks = pickShortlist([c('a', 90, 'within_3_months'), c('b', 90, 'immediately'), c('c', 59), c('d', 80, 'not_looking'), c('e', 75), c('e', 75), c('f', 95)], new Set(['f']), 60, 3)
    expect(picks.map((p) => p.handle)).toEqual(['b', 'a', 'e'])
  })
  it('counts invites (expired pending → expired)', () => {
    expect(countInvites([{ status: 'pending', expires_at: ahead(5) }, { status: 'pending', expires_at: ago(5) }, { status: 'accepted', expires_at: ago(1) }], NOW))
      .toEqual({ pending: 1, accepted: 1, declined: 0, expired: 1, withdrawn: 0 })
  })
})

const SP = { stale_hours: 24, max_offers: 2, followup_hours: 48, slots_offered: 3 }
const iv = (o: Partial<SchedIv>): SchedIv => ({ id: 'i', status: 'awaiting_schedule', created_at: ago(30), updated_at: ago(30), panel_count: 2, app_in_stage: true, ...o })

describe('interview scheduler', () => {
  it('books a candidate-picked time first; otherwise offers after the stale window', () => {
    expect(classifyInterview(iv({ requested_slot: ahead(48) }), null, NOW, SP)).toEqual({ action: 'book_requested', slot: ahead(48) })
    expect(classifyInterview(iv({}), null, NOW, SP)).toEqual({ action: 'offer_slots', reason: 'never_booked' })
    expect(classifyInterview(iv({ self_schedule: true }), null, NOW, SP)).toEqual({ action: 'offer_slots', reason: 'no_pick' })
    expect(classifyInterview(iv({ created_at: ago(2) }), null, NOW, SP)).toBeNull()
  })
  it('paces offers and stops at the max; ignores moved / empty-panel interviews', () => {
    expect(classifyInterview(iv({}), { offers: 1, last_offer_at: ago(10) }, NOW, SP)).toBeNull()
    expect(classifyInterview(iv({}), { offers: 1, last_offer_at: ago(50) }, NOW, SP)).toEqual({ action: 'offer_slots', reason: 'no_pick' })
    expect(classifyInterview(iv({}), { offers: 2, last_offer_at: ago(100) }, NOW, SP)).toBeNull()
    expect(classifyInterview(iv({ app_in_stage: false }), null, NOW, SP)).toBeNull()
    expect(classifyInterview(iv({ panel_count: 0 }), null, NOW, SP)).toBeNull()
  })
  it('re-offers after a recent no-show / cancellation only', () => {
    expect(classifyInterview(iv({ status: 'no_show', updated_at: ago(3) }), null, NOW, SP)).toEqual({ action: 'offer_slots', reason: 'no_show' })
    expect(classifyInterview(iv({ status: 'cancelled', updated_at: ago(24 * 10) }), null, NOW, SP)).toBeNull()
    expect(classifyInterview(iv({ status: 'scheduled' }), null, NOW, SP)).toBeNull()
  })
  it('picks spread-out core-hours slots with lead time', () => {
    const at = (d: number, h: number) => ({ start: `2026-10-${String(23 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`, end: `2026-10-${String(23 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:45:00.000Z` })
    const slots = [at(0, 14), at(1, 8), at(1, 11), at(1, 12), at(2, 11), at(3, 18), at(4, 10)]
    const picked = pickSlots(slots, 3, 'UTC', NOW)
    expect(picked.map((s) => s.start)).toEqual([at(1, 11).start, at(2, 11).start, at(4, 10).start])
    expect(pickSlots([at(1, 8), at(1, 9)], 3, 'UTC', NOW)).toHaveLength(2)
    expect(stillFree([at(1, 11).start, at(9, 9).start], slots)).toEqual([at(1, 11)])
  })
})

describe('assessment author', () => {
  it('band, mix and spec from a job', () => {
    expect(bandFor(0, 1)).toBe('intern')
    expect(bandFor(3, 5)).toBe('mid')
    expect(bandFor(null, 12)).toBe('lead')
    const m = targetMix('senior', 20)
    expect(m.Easy + m.Medium + m.Hard).toBe(20)
    const spec = specFromJob({ title: 'Backend engineer', skills: ['Python', 'SQL'], experience_min: 2 }, ['python', 'Docker'], { target_questions: 10 })
    expect(spec.screening_type).toBe('mixed')
    expect(spec.experience_band).toBe('mid')
    expect(spec.skills).toEqual(['Python', 'SQL', 'python', 'Docker'])
  })
  const q = (id: string, prompt: string, extra: Partial<DraftQuestion> = {}): DraftQuestion => ({ id, type: 'mcq', prompt, options: ['a', 'b', 'c', 'd'], answer: 'a', difficulty: 'Medium', ...extra })
  it('coverage + structural checks', () => {
    const qs = [q('1', 'Which Python keyword defines a generator function?'), q('2', 'Write an SQL query that returns the top earner')]
    expect(coverage(qs, ['Python', 'SQL', 'Docker'])).toEqual({ covered: ['Python', 'SQL'], missing: ['Docker'], pct: 67 })
    expect(structuralIssue(q('3', 'short'))).toBe('too_short')
    expect(structuralIssue(q('4', 'A long enough question text?', { answer: 'z' }))).toBe('answer_not_an_option')
    expect(structuralIssue(q('5', 'A long enough question text?', { options: ['a', 'A', 'b'] }))).toBe('duplicate_options')
    expect(structuralIssue({ id: '6', type: 'coding', prompt: 'Reverse a linked list in place', test_cases: [{ input: '1', output: '1' }] })).toBe('few_test_cases')
  })
  it('dry run: key must be full marks, wrong answers must score low', () => {
    expect(judgeDryRun({ id: 'x', correct_ratio: 1, wrong_ratio: 0, ai: false })).toBeNull()
    expect(judgeDryRun({ id: 'x', correct_ratio: 0, wrong_ratio: 0, ai: false })).toBe('key_not_full_marks')
    expect(judgeDryRun({ id: 'x', correct_ratio: null, wrong_ratio: 0.5, ai: true })).toBe('wrong_answer_scores')
  })
  it('evaluate → refine → propose / give up', () => {
    const spec = specFromJob({ title: 'Data analyst', skills: ['SQL', 'Excel'], experience_min: 1 }, [], { target_questions: 4 })
    const qs = [q('1', 'Write an SQL join that keeps unmatched rows', { difficulty: 'Easy' }), q('2', 'Which SQL clause filters groups?'), q('3', 'Short'), q('4', 'Which SQL function counts rows?', { difficulty: 'Hard' })]
    const ev = evaluateDraft(qs, spec, [{ id: '2', correct_ratio: 0, wrong_ratio: null, ai: false }], { min_coverage_pct: 80 })
    expect(ev.ok).toBe(false)
    expect(ev.broken.map((b) => b.id).sort()).toEqual(['2', '3'])
    expect(ev.missing_skills).toEqual(['Excel'])
    expect(nextStep(ev, 1, { max_rounds: 2 })).toBe('refine')
    const plan = refinePlan(ev, spec)
    expect(plan.drop.sort()).toEqual(['2', '3'])
    expect(plan.fill.skills).toEqual(['Excel'])
    expect(plan.fill.count).toBe(2)
    expect(nextStep(ev, 2, { max_rounds: 2 })).toBe('give_up')
    const good = [q('1', 'Write an SQL join that keeps unmatched rows', { difficulty: 'Easy' }), q('2', 'Which Excel function looks up a value?', { difficulty: 'Easy' }), q('3', 'Which SQL clause filters groups?'), q('4', 'Which Excel feature summarises data?', { difficulty: 'Hard' })]
    const ok = evaluateDraft(good, spec, [], { min_coverage_pct: 80 })
    expect(ok.ok).toBe(true)
    expect(nextStep(ok, 1, { max_rounds: 2 })).toBe('propose')
  })
})

const kase = (o: Partial<CaseInput>): CaseInput => ({ user_id: 'u', name: 'A', attempt_id: null, trust: null, review: 'unreviewed', similarity: null, ai: null, released: false, held: false, ...o })

describe('integrity reviewer', () => {
  it('priority combines trust, unreviewed similarity and AI signals; cleared is 0', () => {
    expect(priority(kase({ trust: { score: 40, band: 'flag', incidents: 5, top: [] } }))).toBe(30)
    expect(priority(kase({ similarity: { max_score: 0.9, cluster_size: 3, question: 'q', reviewed: false } }))).toBe(27)
    expect(priority(kase({ similarity: { max_score: 0.9, cluster_size: 3, question: 'q', reviewed: true } }))).toBe(0)
    expect(priority(kase({ ai: { level: 'high', labels: [] } }))).toBe(22)
    expect(priority(kase({ review: 'cleared', trust: { score: 0, band: 'flag', incidents: 9, top: [] } }))).toBe(0)
  })
  it('recommends hold above threshold, release when cleared while held, never for released scores', () => {
    expect(recommend(kase({}), 70, 60)).toBe('hold')
    expect(recommend(kase({ released: true }), 90, 60)).toBe('none')
    expect(recommend(kase({ held: true }), 90, 60)).toBe('none')
    expect(recommend(kase({ held: true, review: 'cleared' }), 0, 60)).toBe('release_hold')
    expect(recommend(kase({}), 59, 60)).toBe('none')
  })
  it('ranks, keeps release-hold cases and caps the queue', () => {
    const r = rankCases([
      kase({ user_id: 'low', name: 'B', ai: { level: 'low', labels: [] } }),
      kase({ user_id: 'high', name: 'A', trust: { score: 10, band: 'flag', incidents: 8, top: [] }, ai: { level: 'high', labels: [] } }),
      kase({ user_id: 'clear', name: 'C' }),
      kase({ user_id: 'rel', name: 'D', held: true, review: 'cleared' }),
    ], { hold_threshold: 60, max_cases: 10 })
    expect(r.map((x) => [x.user_id, x.recommendation])).toEqual([['high', 'hold'], ['low', 'none'], ['rel', 'release_hold']])
    expect(rankCases([kase({ ai: { level: 'low', labels: [] } }), kase({ user_id: 'b', ai: { level: 'low', labels: [] } })], { hold_threshold: 60, max_cases: 1 })).toHaveLength(1)
  })
  it('facts carry no names; summaries are neutral and localised', () => {
    const c = kase({ name: 'Asha Rao', trust: { score: 42, band: 'flag', incidents: 3, top: ['tab_hidden ×4'] }, similarity: { max_score: 0.91, cluster_size: 3, question: 'Q2', reviewed: false }, ai: { level: 'medium', labels: ['Mostly pasted'] } })
    expect(caseFacts(c).join(' ')).not.toContain('Asha')
    const en = evidenceSummary('en', c)
    expect(en).toContain('Trust score 42')
    expect(en).toContain('91% similar to 2 other')
    expect(en).toContain('not proof')
    expect(en).not.toMatch(/cheat/i)
    expect(evidenceSummary('hi', c)).toMatch(/[ऀ-ॿ]/)
    expect(evidenceSummary('te', c)).toMatch(/[ఀ-౿]/)
  })
})

describe('hiring agents strings', () => {
  const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  for (const l of ['hi', 'te'] as const) {
    it(`${l}: every key, same placeholders, translated`, () => {
      const en = HL_MESSAGES.en as Record<string, string>
      const tr = HL_MESSAGES[l] as Record<string, string>
      expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(en)) {
        expect(slots(tr[k]), k).toEqual(slots(v))
        if (/[A-Za-z]{3}/.test(v.replace(/\{\w+\}|CodeSpectra|WhatsApp|AI|USD|UTC/g, ''))) expect(tr[k], k).not.toBe(v)
      }
    })
  }
  it('translator fills slots and falls back', () => {
    expect(hlt('te', 'integrity.priority', { value: 7 })).toContain('7')
    expect(hlt('xx', 'on')).toBe('On')
    expect(hlt('en', 'no.such.key')).toBe('no.such.key')
  })
})
