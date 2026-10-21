/**
 * Test integrity pure logic (lib/integrity): trust score, event batch
 * validation, typing cadence, MOSS-style code similarity + clusters + diff,
 * AI-written signals, settings validation. No Mongo, no AI.
 * Run: npx vitest run tests/integrity.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeTrustScore, bandFor } from '@/lib/integrity/trust-score'
import { cleanEventBatch, MAX_BATCH } from '@/lib/integrity/events'
import { summariseCadence, mergeCadence, keyClassOf, type KeySample } from '@/lib/integrity/cadence'
import {
  normalizeTokens, stripComments, fingerprints, codeSimilarity, pairwiseSimilarity, clusterPairs, sideBySideDiff,
} from '@/lib/integrity/code-similarity'
import { aiSignals, combineSignals } from '@/lib/integrity/ai-signals'
import {
  applySettingsPatch, candidateConfig, DEFAULT_INTEGRITY_SETTINGS, enabledSignals, needsCamera, resolveSettings, type SignalId,
} from '@/lib/integrity/types'
import { yawFromLandmarks } from '@/lib/integrity/face-watch'

const T0 = 1_700_000_000_000

describe('computeTrustScore', () => {
  it('is 100 and clear with no events', () => {
    const r = computeTrustScore([])
    expect(r.score).toBe(100)
    expect(r.band).toBe('clear')
    expect(r.timeline).toEqual([])
  })

  it('system and typing events never cost points', () => {
    const r = computeTrustScore([
      { type: 'consent_given', at: T0 }, { type: 'session_start', at: T0 + 1 }, { type: 'typing_summary', at: T0 + 2, data: { keys: 100 } },
    ])
    expect(r.score).toBe(100)
    expect(r.timeline.every((e) => e.penalty === 0 && e.severity === 'info')).toBe(true)
  })

  it('applies the first-incident weight', () => {
    const r = computeTrustScore([{ type: 'face_multiple', at: T0, data: { count: 2 } }])
    expect(r.score).toBe(88)
    expect(r.by_type.face_multiple).toMatchObject({ count: 1, incidents: 1, penalty: 12 })
  })

  it('merges bursts of the same type', () => {
    const r = computeTrustScore([
      { type: 'fullscreen_exit', at: T0 }, { type: 'fullscreen_exit', at: T0 + 2_000 }, { type: 'fullscreen_exit', at: T0 + 4_000 },
    ])
    expect(r.by_type.fullscreen_exit.incidents).toBe(1)
    expect(r.score).toBe(96)
  })

  it('decays repeats geometrically', () => {
    const r = computeTrustScore([
      { type: 'fullscreen_exit', at: T0 }, { type: 'fullscreen_exit', at: T0 + 60_000 },
    ])
    // 4 + 4*0.6 = 6.4
    expect(r.penalty).toBeCloseTo(6.4, 5)
    expect(r.timeline[1].penalty).toBeCloseTo(2.4, 5)
  })

  it('caps each type', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ type: 'face_multiple', at: T0 + i * 60_000, data: { count: 2 } }))
    const r = computeTrustScore(many)
    expect(r.by_type.face_multiple.penalty).toBe(30)
    expect(r.by_type.face_multiple.capped).toBe(true)
    expect(r.score).toBe(70)
  })

  it('adds time away and paste length on top', () => {
    const away = computeTrustScore([{ type: 'tab_hidden', at: T0, data: { duration_ms: 120_000 } }])
    expect(away.penalty).toBe(5 + 4)
    const paste = computeTrustScore([{ type: 'paste', at: T0, data: { length: 500 } }])
    expect(paste.penalty).toBe(2 + 4)
  })

  it('floors at 0, sorts the timeline and keeps unknown types as info', () => {
    const evs = []
    for (const type of ['face_multiple', 'face_none', 'tab_hidden', 'paste', 'fullscreen_exit', 'looking_away', 'devtools_open', 'multi_monitor', 'network_change', 'camera_blocked', 'window_blur']) {
      for (let i = 0; i < 30; i++) evs.push({ type, at: T0 + i * 60_000, data: { duration_ms: 600_000, length: 1000, count: 4 } })
    }
    evs.push({ type: 'mystery', at: T0 - 5 })
    const r = computeTrustScore(evs.reverse())
    expect(r.score).toBe(0)
    expect(r.band).toBe('flag')
    expect(r.timeline[0].type).toBe('mystery')
    expect(r.timeline[0].penalty).toBe(0)
    for (let i = 1; i < r.timeline.length; i++) expect(r.timeline[i].at).toBeGreaterThanOrEqual(r.timeline[i - 1].at)
  })

  it('accepts weight overrides', () => {
    const r = computeTrustScore([{ type: 'copy', at: T0 }], { rules: { copy: { weight: 3, cap: 3 } } })
    expect(r.penalty).toBe(3)
  })

  it('bands', () => {
    expect(bandFor(100)).toBe('clear')
    expect(bandFor(80)).toBe('clear')
    expect(bandFor(79)).toBe('review')
    expect(bandFor(60)).toBe('review')
    expect(bandFor(59)).toBe('flag')
  })
})

describe('cleanEventBatch', () => {
  const all = new Set<SignalId>(['face_count', 'looking_away', 'tab_focus', 'fullscreen', 'clipboard', 'devtools', 'multi_monitor', 'network', 'typing_cadence'])
  const win = { from: T0, to: T0 + 3_600_000 }

  it('keeps known, enabled types and whitelisted fields only', () => {
    const { events, dropped } = cleanEventBatch([
      { type: 'paste', at: T0 + 10, q: 'q1', data: { length: 120, text: 'secret code', lines: 4 } },
      { type: 'hack', at: T0 },
      { type: 'network_change', at: T0 }, // server-only
      null,
    ], all, win)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ type: 'paste', at: T0 + 10, q: 'q1', data: { length: 120, lines: 4 } })
    expect(dropped).toBe(3)
  })

  it('drops signals the author did not switch on, but keeps system events', () => {
    const { events } = cleanEventBatch([{ type: 'face_none', at: T0 }, { type: 'consent_given', at: T0 }], new Set<SignalId>(['clipboard']), win)
    expect(events.map((e) => e.type)).toEqual(['consent_given'])
  })

  it('clamps timestamps outside the attempt and marks them', () => {
    const { events } = cleanEventBatch([{ type: 'copy', at: T0 - 999_999 }, { type: 'copy', at: 'x' }], all, win)
    expect(events.every((e) => e.at === win.to && e.data.clock_skew === true)).toBe(true)
  })

  it('rejects bad question ids and caps batch size', () => {
    const { events } = cleanEventBatch([{ type: 'copy', at: T0, q: '../etc' }], all, win)
    expect(events[0].q).toBeNull()
    const big = Array.from({ length: MAX_BATCH + 7 }, () => ({ type: 'copy', at: T0 }))
    const r = cleanEventBatch(big, all, win)
    expect(r.events).toHaveLength(MAX_BATCH)
    expect(r.dropped).toBe(7)
  })

  it('ignores non-arrays', () => {
    expect(cleanEventBatch({ type: 'copy' }, all, win)).toEqual({ events: [], dropped: 0 })
  })
})

describe('typing cadence', () => {
  const human: KeySample[] = [0, 180, 420, 510, 900, 1150, 1300, 7000, 7200, 7500].map((t, i) => ({ t, k: i === 4 ? 'delete' : 'char' }))

  it('summarises gaps, pauses and deletes', () => {
    const s = summariseCadence(human)
    expect(s.keys).toBe(10)
    expect(s.deletes).toBe(1)
    expect(s.chars).toBe(9)
    expect(s.pauses).toBe(1) // 1300 → 7000
    expect(s.first_at).toBe(0)
    expect(s.last_at).toBe(7500)
    expect(s.mean_ms).toBeGreaterThan(100)
    expect(s.sd_ms).toBeGreaterThan(0)
  })

  it('counts fast bursts', () => {
    const bot = Array.from({ length: 24 }, (_, i) => ({ t: i * 20, k: 'char' as const }))
    expect(summariseCadence(bot).fast_bursts).toBe(1)
    expect(summariseCadence(bot).sd_ms).toBe(0)
  })

  it('merges summaries', () => {
    const a = summariseCadence(human)
    const m = mergeCadence([a, { ...a, first_at: -100, last_at: 9000 }])
    expect(m.keys).toBe(20)
    expect(m.first_at).toBe(-100)
    expect(m.last_at).toBe(9000)
    expect(m.mean_ms).toBe(a.mean_ms)
  })

  it('classifies keys without keeping them', () => {
    expect(keyClassOf({ key: 'a' })).toBe('char')
    expect(keyClassOf({ key: 'Backspace' })).toBe('delete')
    expect(keyClassOf({ key: 'v', ctrlKey: true })).toBe('other')
    expect(keyClassOf({ key: 'ArrowLeft' })).toBe('other')
  })
})

const A = `
// sum of two numbers
function addNumbers(first, second) {
  /* add them */
  const total = first + second;
  if (total > 10) { return total * 2 }
  for (let i = 0; i < total; i++) { console.log("value", i) }
  return total;
}`
const A_RENAMED = `
function f(x,y){const s=x+y
if(s>10){return s*2}
for(let k=0;k<s;k++){console.log('other text',k)}
return s}`
const B = `
def solve(nums):
    best = 0
    seen = {}
    for idx, n in enumerate(nums):
        if n in seen:
            best = max(best, idx - seen[n])
        else:
            seen[n] = idx
    return best
`

describe('code normalisation', () => {
  it('strips comments but keeps strings', () => {
    expect(stripComments('a = 1 // c\nb = "// not a comment"')).toContain('"// not a comment"')
    expect(stripComments('x = 1  # note\ny = "#keep"', 'python')).not.toContain('note')
    expect(stripComments('select 1 -- c', 'sql')).not.toContain('c\n')
  })

  it('renames identifiers, strings and numbers', () => {
    expect(normalizeTokens('let total = count + 42 + "hi"')).toEqual(['let', 'V', '=', 'V', '+', 'N', '+', 'S'])
  })

  it('is invariant to renaming, comments and formatting', () => {
    expect(normalizeTokens(A)).toEqual(normalizeTokens(A_RENAMED))
    expect(codeSimilarity(A, A_RENAMED)).toBe(1)
  })

  it('scores unrelated code low', () => {
    expect(codeSimilarity(A, B)).toBeLessThan(0.3)
  })

  it('winnowing keeps fewer hashes than k-grams and is deterministic', () => {
    const t = normalizeTokens(A)
    const f1 = fingerprints(t)
    expect(f1.size).toBeGreaterThan(0)
    expect(f1.size).toBeLessThan(t.length)
    expect([...fingerprints(t)]).toEqual([...f1])
  })
})

describe('pairwiseSimilarity + clusters', () => {
  const subs = [
    { id: 's1', owner: 'u1', code: A },
    { id: 's2', owner: 'u2', code: A_RENAMED },
    { id: 's3', owner: 'u3', code: B, language: 'python' },
    { id: 's4', owner: 'u1', code: A }, // same owner as s1: never paired with it
  ]

  it('finds the copied pair and skips same-owner pairs', () => {
    const pairs = pairwiseSimilarity(subs, { threshold: 0.6, minTokens: 10 })
    const keys = pairs.map((p) => [p.a, p.b].sort().join('-'))
    expect(keys).toContain('s1-s2')
    expect(keys).not.toContain('s1-s4')
    expect(keys.some((k) => k.includes('s3'))).toBe(false)
  })

  it('ignores starter code', () => {
    const starter = A
    const pairs = pairwiseSimilarity([{ id: 'a', owner: 'x', code: A }, { id: 'b', owner: 'y', code: A }], { starterCode: [starter], minTokens: 1 })
    expect(pairs).toHaveLength(0)
  })

  it('skips answers below min tokens', () => {
    expect(pairwiseSimilarity([{ id: 'a', owner: 'x', code: 'x=1' }, { id: 'b', owner: 'y', code: 'y=1' }], { minTokens: 25 })).toHaveLength(0)
  })

  it('clusters connected pairs', () => {
    const cl = clusterPairs([
      { a: 'a', b: 'b', score: 0.9, a_in_b: 1, b_in_a: 1, structure: 1, shared: 10 },
      { a: 'b', b: 'c', score: 0.7, a_in_b: 1, b_in_a: 1, structure: 1, shared: 8 },
      { a: 'x', b: 'y', score: 0.65, a_in_b: 1, b_in_a: 1, structure: 1, shared: 5 },
    ])
    expect(cl).toHaveLength(2)
    expect(cl[0].members.sort()).toEqual(['a', 'b', 'c'])
    expect(cl[0].max_score).toBe(0.9)
    expect(cl[1].members.sort()).toEqual(['x', 'y'])
  })
})

describe('sideBySideDiff', () => {
  it('aligns equal lines ignoring spacing', () => {
    const rows = sideBySideDiff('a\nb\nc', 'a\n  b  \nX\nc')
    expect(rows.filter((r) => r.same).map((r) => r.left?.text.trim())).toEqual(['a', 'b', 'c'])
    expect(rows.find((r) => !r.same)?.right?.text).toBe('X')
  })
  it('handles empty input', () => {
    expect(sideBySideDiff('', '')).toHaveLength(1)
  })
})

describe('aiSignals', () => {
  it('no signals for an ordinary typed answer', () => {
    const r = aiSignals({ code_length: 400, pasted_chars: 0, paste_events: 0, typed_chars: 520, mean_gap_ms: 180, sd_gap_ms: 150, fast_bursts: 0, time_ms: 18 * 60_000, difficulty: 'Medium', solved: true })
    expect(r.signals).toEqual([])
    expect(r.level).toBe('none')
  })

  it('flags mostly-pasted, little typing, fast solve — as signals', () => {
    const r = aiSignals({ code_length: 800, pasted_chars: 700, paste_events: 1, typed_chars: 30, mean_gap_ms: 200, sd_gap_ms: 160, time_ms: 2 * 60_000, difficulty: 'hard', solved: true })
    const ids = r.signals.map((s) => s.id)
    expect(ids).toContain('paste_share')
    expect(ids).toContain('fast_solution')
    expect(r.level).toBe('high')
    expect(r.signals.every((s) => s.strength >= 0 && s.strength <= 1)).toBe(true)
  })

  it('flags very even typing and bursts', () => {
    const r = aiSignals({ code_length: 300, pasted_chars: 0, paste_events: 0, typed_chars: 300, mean_gap_ms: 40, sd_gap_ms: 4, fast_bursts: 6, time_ms: null, solved: false })
    expect(r.signals.map((s) => s.id).sort()).toEqual(['fast_bursts', 'uniform_rhythm'])
  })

  it('ignores a low classifier score and short answers', () => {
    expect(aiSignals({ code_length: 300, pasted_chars: 0, paste_events: 0, typed_chars: null, time_ms: null, solved: false, classifier: 0.3 }).signals).toEqual([])
    expect(aiSignals({ code_length: 10, pasted_chars: 10, paste_events: 1, typed_chars: 0, time_ms: null, solved: false }).signals).toEqual([])
  })

  it('one weak signal stays low', () => {
    const r = combineSignals([{ id: 'classifier', label: 'x', detail: '', strength: 0.2 }])
    expect(r.level).toBe('low')
  })
})

describe('settings', () => {
  it('defaults are off and safe', () => {
    const s = resolveSettings(null)
    expect(s.enabled).toBe(false)
    expect(s.continuous_video).toBe(false)
    expect(s.snapshots_on_violation).toBe(false)
    expect(s.ai_signals.classifier).toBe(false)
    expect(enabledSignals(s)).toEqual([])
  })

  it('falls back field by field on bad stored values', () => {
    const s = resolveSettings({ enabled: true, face_interval_sec: 1, signals: { face_count: true, bogus: true }, similarity: { threshold: 9 } })
    expect(s.enabled).toBe(true)
    expect(s.face_interval_sec).toBe(DEFAULT_INTEGRITY_SETTINGS.face_interval_sec)
    expect(s.signals.face_count).toBe(true)
    expect(s.similarity.threshold).toBe(0.6)
    expect(needsCamera(s)).toBe(true)
  })

  it('validates patches strictly', () => {
    const base = resolveSettings(null)
    expect(applySettingsPatch(base, { enabled: 'yes' }).ok).toBe(false)
    expect(applySettingsPatch(base, { unknown: 1 }).ok).toBe(false)
    expect(applySettingsPatch(base, { face_interval_sec: 2 }).ok).toBe(false)
    const r = applySettingsPatch(base, { enabled: true, signals: { face_count: true }, similarity: { threshold: 0.8 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.settings.signals.face_count).toBe(true)
      expect(r.settings.signals.clipboard).toBe(true) // untouched default
      expect(r.settings.similarity).toEqual({ ...base.similarity, threshold: 0.8 })
    }
  })

  it('candidate config hides reviewer-only fields', () => {
    const s = { ...resolveSettings({ enabled: true, snapshots_on_violation: true, signals: { face_count: true } }) }
    const c = candidateConfig(s, false)
    expect(c.snapshots).toBe(true)
    expect(c.signals).toContain('face_count')
    expect(Object.keys(c).sort()).toEqual(['consented', 'continuous_video', 'enabled', 'face_interval_sec', 'signals', 'snapshots'])
  })
})

describe('yawFromLandmarks', () => {
  it('is ~0 for a centred nose and grows when turned', () => {
    const pts = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }))
    pts[36] = { x: 0, y: 0 }; pts[39] = { x: 20, y: 0 }; pts[42] = { x: 40, y: 0 }; pts[45] = { x: 60, y: 0 }
    pts[30] = { x: 30, y: 30 }
    expect(yawFromLandmarks(pts)).toBe(0)
    pts[30] = { x: 45, y: 30 }
    expect(yawFromLandmarks(pts)!).toBeGreaterThan(25)
    expect(yawFromLandmarks([])).toBeNull()
  })
})
