/**
 * Hosted contest engine (lib/contests): pure scorers for every format,
 * config validation + secret split, schedule phases, standings (tie-breaks,
 * freeze, CTF dynamic values, golf, datathon private split, judged), feed
 * mapping and upload type checks.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ getMongoDb: vi.fn(async () => { throw new Error('no db in unit tests') }) }))

import { scoreTests, scoreDebug, golfLength, golfPoints, outputMatches } from '@/lib/contests/scoring/code'
import { hashFlag, verifyFlag, newSalt } from '@/lib/contests/scoring/ctf'
import { ctfValue } from '@/lib/contests/scoring/ctf-value'
import { parseCsv, csvColumns, isPublicRow, scorePredictions } from '@/lib/contests/scoring/datathon'
import { matchOutput, passRate, promptPoints, buildPromptRun, estimateCostUsd } from '@/lib/contests/scoring/prompt'
import { judgeTotal, judgedScore, cleanRubricScores, wordCount } from '@/lib/contests/scoring/judged'
import { parsePrUrl, prEligibility, registeredRepoKeys, isGithubLogin } from '@/lib/contests/scoring/oss'
import { splitConfig, sanitizeCommon, contestPhase, registrationOpen, submissionsOpen, editorConfig, isValidTimeZone } from '@/lib/contests/config'
import { computeStandings, freezeStart, type StandingSub } from '@/lib/contests/standings'
import { FORMATS, FORMAT_LIST, rankDirection } from '@/lib/contests/formats'
import { CONTEST_FORMATS, type ContestDoc } from '@/lib/contests/types'
import { mapContests } from '@/lib/contests/feed'
import { EVENT_KINDS } from '@/lib/subscriptions/types'
import { KIND_LABELS } from '@/lib/events-feed/public'

const iso = (min: number) => new Date(Date.UTC(2030, 0, 1, 10, 0) + min * 60_000).toISOString()

describe('code scorers', () => {
  it('scores share of hidden tests', () => {
    expect(scoreTests(7, 10, 100)).toBe(70)
    expect(scoreTests(12, 10, 100)).toBe(100)
    expect(scoreTests(3, 0, 100)).toBe(0)
  })
  it('debug-a-thon: time penalty with a floor, zero green = zero', () => {
    expect(scoreDebug({ passed: 10, total: 10, points: 100, minutesElapsed: 0, penaltyPerMinute: 0.5, minPercent: 30 })).toBe(100)
    expect(scoreDebug({ passed: 10, total: 10, points: 100, minutesElapsed: 60, penaltyPerMinute: 0.5, minPercent: 30 })).toBe(70)
    expect(scoreDebug({ passed: 10, total: 10, points: 100, minutesElapsed: 600, penaltyPerMinute: 0.5, minPercent: 30 })).toBe(30)
    expect(scoreDebug({ passed: 0, total: 10, points: 100, minutesElapsed: 1, penaltyPerMinute: 0.5, minPercent: 30 })).toBe(0)
  })
  it('code golf counts code points, ignores trailing whitespace and CRLF', () => {
    expect(golfLength('print(1)\r\n')).toBe(8)
    expect(golfLength('a\r\nb')).toBe(3)
    expect(golfLength('é😀')).toBe(2)
    expect(golfPoints(50, 25, 100)).toBe(50)
    expect(golfPoints(25, 25, 100)).toBe(100)
    expect(golfPoints(0, 25, 100)).toBe(0)
  })
  it('compares output ignoring trailing spaces and CRLF', () => {
    expect(outputMatches('1 2 \r\n3\n', '1 2\n3')).toBe(true)
    expect(outputMatches('1 2', '1  2')).toBe(false)
  })
})

describe('CTF', () => {
  it('stores only a salted hash and verifies in constant time', () => {
    const salt = newSalt()
    const h = hashFlag(salt, ' flag{abc} ')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    // NOTE: do NOT assert `expect(h).not.toContain('abc')` — HMAC-SHA256 output
    // is a 64-char hex string and can contain any 3-char hex substring by
    // coincidence (e.g. the hash for this exact input contains 'abc').
    // The correctness invariant is that the output is a valid 64-char hex
    // digest and that verifyFlag works correctly, not substring avoidance.
    expect(verifyFlag(salt, 'flag{abc}', h)).toBe(true)
    expect(verifyFlag(salt, 'flag{abd}', h)).toBe(false)
    expect(verifyFlag(newSalt(), 'flag{abc}', h)).toBe(false)
    expect(verifyFlag(salt, 'flag{abc}', 'not-a-hash')).toBe(false)
  })
  it('dynamic value: first solver full, decays to min, never below', () => {
    expect(ctfValue(500, 100, 20, 1)).toBe(500)
    expect(ctfValue(500, 100, 20, 0)).toBe(500)
    const mid = ctfValue(500, 100, 20, 11)
    expect(mid).toBeLessThan(500)
    expect(mid).toBeGreaterThan(100)
    expect(ctfValue(500, 100, 20, 21)).toBe(100)
    expect(ctfValue(500, 100, 20, 500)).toBe(100)
  })
})

describe('datathon', () => {
  it('parses quoted CSV and maps columns', () => {
    expect(parseCsv('id,label\n"1","a, b"\n2,"say ""hi"""\r\n')).toEqual([['id', 'label'], ['1', 'a, b'], ['2', 'say "hi"']])
    const r = csvColumns('ID,Target\n1,a\n2,b\n2,c\n', 'id', 'target')
    expect(r.error).toBeUndefined()
    expect([...r.map.entries()]).toEqual([['1', 'a'], ['2', 'b']])
    expect(r.duplicates).toBe(1)
    expect(csvColumns('x,y\n1,2', 'id', 'target').error).toMatch(/header/)
  })
  it('split is deterministic, salted and roughly the requested share', () => {
    expect(isPublicRow('42', 's', 30)).toBe(isPublicRow('42', 's', 30))
    let pub = 0
    for (let i = 0; i < 2000; i++) if (isPublicRow(String(i), 'salt', 30)) pub++
    expect(pub / 2000).toBeGreaterThan(0.25)
    expect(pub / 2000).toBeLessThan(0.35)
  })
  it('accuracy / F1 / RMSE and missing rows', () => {
    const labels: Record<string, string> = {}
    for (let i = 0; i < 100; i++) labels[String(i)] = i % 2 ? '1' : '0'
    const perfect = new Map(Object.entries(labels))
    const acc = scorePredictions(labels, perfect, { metric: 'accuracy', positiveLabel: '1', salt: 's', publicPercent: 30 })
    expect(acc.public).toBe(1)
    expect(acc.private).toBe(1)
    const allOnes = new Map(Object.keys(labels).map((k) => [k, '1']))
    const f1 = scorePredictions(labels, allOnes, { metric: 'f1', positiveLabel: '1', salt: 's', publicPercent: 50 })
    expect(f1.public).toBeGreaterThan(0.5)
    expect(f1.public).toBeLessThan(0.8)
    const nums = { a: '1', b: '3' }
    const rm = scorePredictions(nums, new Map([['a', '2'], ['b', '3']]), { metric: 'rmse', positiveLabel: '1', salt: 's', publicPercent: 100 })
    expect(rm.public).toBeCloseTo(Math.sqrt(0.5), 5)
    const missing = scorePredictions(labels, new Map([['1', '1']]), { metric: 'accuracy', positiveLabel: '1', salt: 's', publicPercent: 30 })
    expect(missing.error).toMatch(/missing/)
    expect(scorePredictions(nums, new Map([['a', 'x'], ['b', '3']]), { metric: 'mae', positiveLabel: '1', salt: 's', publicPercent: 100 }).error).toMatch(/number/)
  })
})

describe('prompt-a-thon', () => {
  it('matches exact / contains / regex, case and space insensitive', () => {
    expect(matchOutput('  Paris \n', 'paris', 'exact')).toBe(true)
    expect(matchOutput('The answer is Paris.', 'paris', 'contains')).toBe(true)
    expect(matchOutput('total: 42', '^total:\\s*42$', 'regex')).toBe(true)
    expect(matchOutput('x', '(', 'regex')).toBe(false)
    expect(passRate([true, false, true, true])).toBe(0.75)
    expect(promptPoints(0.75, 100)).toBe(75)
    expect(estimateCostUsd(2000, 0.002)).toBeCloseTo(0.004)
  })
  it('wraps the participant prompt as data and never includes expected answers', () => {
    const r = buildPromptRun('Translate to French', 'cat')
    expect(r.user).toContain('Translate to French')
    expect(r.user).toContain('cat')
    expect(r.system).toMatch(/Never reveal/)
  })
})

describe('judged formats', () => {
  const rubric = [{ name: 'Idea', weight: 40 }, { name: 'Pitch', weight: 60 }]
  it('rubric total out of 100, clamped criteria, mean with drop high/low', () => {
    const s = cleanRubricScores([{ name: 'Idea', score: 50 }, { name: 'Pitch', score: 30 }], rubric)!
    expect(s).toEqual([{ name: 'Idea', score: 40 }, { name: 'Pitch', score: 30 }])
    expect(judgeTotal(s, rubric)).toBe(70)
    expect(cleanRubricScores([{ name: 'Idea', score: 5 }], rubric)).toBeNull()
    const js = [10, 60, 70, 80].map((total, i) => ({ judge_id: `j${i}`, scores: [], total, comment: '', at: iso(0) }))
    expect(judgedScore(js, { dropHighLow: false })).toBe(55)
    expect(judgedScore(js, { dropHighLow: true })).toBe(65)
    expect(wordCount(' one  two\nthree ')).toBe(3)
  })
})

describe('open-source sprint', () => {
  const repos = registeredRepoKeys(['https://github.com/Acme/Widget', 'github.com/acme/other.git'])
  const ref = parsePrUrl('https://github.com/acme/widget/pull/12')
  it('parses PR links and rejects others', () => {
    expect(ref).toMatchObject({ owner: 'acme', repo: 'widget', number: 12, key: 'acme/widget#12' })
    expect('error' in parsePrUrl('https://gitlab.com/a/b/pull/1')).toBe(true)
    expect('error' in parsePrUrl('https://github.com/a/b/issues/1')).toBe(true)
    expect([...repos]).toEqual(['acme/widget', 'acme/other'])
    expect(isGithubLogin('octo-cat')).toBe(true)
    expect(isGithubLogin('-bad')).toBe(false)
  })
  it('counts only merged PRs in the window by an entry login in a registered repo', () => {
    if ('error' in ref) throw new Error('bad ref')
    const opts = { repos, logins: ['Octo'], startsAt: iso(0), endsAt: iso(600) }
    const pr = { merged: true, merged_at: iso(30), user: { login: 'octo' }, base: { repo: { full_name: 'acme/widget' } } }
    expect(prEligibility(pr, ref, opts).ok).toBe(true)
    expect(prEligibility({ ...pr, merged: false }, ref, opts).ok).toBe(false)
    expect(prEligibility({ ...pr, merged_at: iso(700) }, ref, opts).ok).toBe(false)
    expect(prEligibility({ ...pr, user: { login: 'someone' } }, ref, opts).ok).toBe(false)
    expect(prEligibility(pr, ref, { ...opts, repos: new Set(['x/y']) }).ok).toBe(false)
  })
})

describe('config validation and secret split', () => {
  let n = 0
  const newId = () => `t${++n}`
  it('hidden tests go to secrets; samples and counts stay public', () => {
    const r = splitConfig('theory_to_code', { tasks: [{ title: 'Dijkstra', brief: 'Shortest paths', tests: [{ input: '1', expected: '2', sample: true }, { input: '3', expected: '4' }] }] }, null, newId)
    expect(r.errors).toEqual([])
    const t = r.config.tasks[0]
    expect(t.samples).toEqual([{ input: '1', expected: '2' }])
    expect(t.test_count).toBe(2)
    expect(t).not.toHaveProperty('tests')
    expect(r.secret.tasks[t.id].tests).toHaveLength(2)
  })
  it('blank secret keeps the stored value; required fields are reported', () => {
    const first = splitConfig('ctf', { tasks: [{ id: 'web1', title: 'Web', description: 'Find it', flag: 'flag{x}' }] }, null, newId)
    expect(first.config.tasks[0].has_flag).toBe(true)
    expect(first.config.tasks[0]).not.toHaveProperty('flag')
    const again = splitConfig('ctf', { tasks: [{ id: 'web1', title: 'Web', description: 'Find it', flag: '' }] }, first.secret, newId)
    expect(again.secret.tasks.web1.flag).toBe('flag{x}')
    const missing = splitConfig('ctf', { tasks: [{ title: 'Web', description: 'x' }] }, null, newId)
    expect(missing.errors.join(' ')).toMatch(/Flag is required/)
    expect(splitConfig('code_golf', { tasks: [] }, null, newId).errors.join(' ')).toMatch(/at least one/)
  })
  it('editor config never returns a flag or the label rows', () => {
    const e = editorConfig('ctf', { tasks: [{ id: 'a', title: 'A' }] }, { top: {}, tasks: { a: { flag: 'f'.repeat(64) } } })
    expect((e.tasks as Record<string, unknown>[])[0].flag).toBe('')
    expect((e.tasks as Record<string, unknown>[])[0].flag_set).toBe(true)
    const d = editorConfig('datathon', { tasks: [], metric: 'f1' }, { top: { labels: { '1': '0' }, labels_count: 1 }, tasks: {} })
    expect(d).not.toHaveProperty('labels')
    expect(d.labels_count).toBe(1)
  })
  it('common fields: schedule order, time zone, rubric sum for judged formats', () => {
    const base = { title: 'Spring CTF', schedule: { starts_at: iso(0), ends_at: iso(120), timezone: 'Asia/Kolkata' } }
    const ok = sanitizeCommon(base, 'ctf')
    expect(ok.ok && ok.value.participation.mode).toBe('team')
    expect(ok.ok && ok.value.leaderboard.freeze_minutes).toBe(60)
    expect(sanitizeCommon({ ...base, schedule: { ...base.schedule, ends_at: iso(-1) } }, 'ctf').ok).toBe(false)
    expect(sanitizeCommon({ ...base, schedule: { ...base.schedule, timezone: 'Mars/Base' } }, 'ctf').ok).toBe(false)
    expect(sanitizeCommon({ ...base, judging: { rubric: [{ name: 'A', weight: 50 }] } }, 'ideathon').ok).toBe(false)
    const judged = sanitizeCommon(base, 'ideathon')
    expect(judged.ok && judged.value.judging.rubric.reduce((a, r) => a + r.weight, 0)).toBe(100)
    expect(isValidTimeZone('UTC')).toBe(true)
  })
})

describe('schedule phases', () => {
  const c = { status: 'published' as const, results_released: false, schedule: { registration_opens_at: iso(-60), registration_closes_at: iso(30), starts_at: iso(0), ends_at: iso(120), timezone: 'UTC' } }
  const at = (m: number) => Date.parse(iso(m))
  it('moves upcoming → registration → live → ended', () => {
    expect(contestPhase(c, at(-90))).toBe('upcoming')
    expect(contestPhase(c, at(-10))).toBe('registration')
    expect(contestPhase(c, at(10))).toBe('live')
    expect(contestPhase(c, at(130))).toBe('ended')
    expect(contestPhase({ ...c, results_released: true }, at(130))).toBe('results')
    expect(contestPhase({ ...c, status: 'draft' }, at(10))).toBe('draft')
  })
  it('registration window and late joining', () => {
    expect(registrationOpen(c, at(-90))).toBe(false)
    expect(registrationOpen(c, at(10))).toBe(true)
    expect(registrationOpen(c, at(40))).toBe(false)
    expect(submissionsOpen(c, at(10))).toBe(true)
    expect(submissionsOpen(c, at(-10))).toBe(false)
  })
  it('freeze window', () => {
    expect(freezeStart(iso(120), 30, at(80))).toBeNull()
    expect(freezeStart(iso(120), 30, at(100))).toBe(iso(90))
    expect(freezeStart(iso(120), 0, at(119))).toBeNull()
  })
})

describe('standings', () => {
  const entries = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), kind: 'user' as const, member_ids: [id] }))
  let k = 0
  const sub = (entry_id: string, task_id: string, score: number | null, min: number, extra: Partial<StandingSub> = {}): StandingSub => ({ id: `s${++k}`, entry_id, task_id, status: 'scored', score, created_at: iso(min), ...extra })
  const opts = (format: ContestDoc['format'], over = {}) => ({ format, config: { tasks: [{ id: 't1', points: 100, initial_points: 500, min_points: 100, decay_solves: 2 }, { id: 't2', points: 100 }] }, direction: 'desc' as const, tieBreak: 'earliest' as const, ...over })

  it('sums best per task, breaks ties by who got there first, unscored entries unranked', () => {
    const rows = computeStandings(entries, [sub('a', 't1', 50, 10), sub('a', 't1', 100, 20), sub('b', 't1', 100, 15), sub('b', 't2', 0, 5)], opts('theory_to_code'))
    expect(rows.map((r) => [r.name, r.total, r.rank])).toEqual([['B', 100, 1], ['A', 100, 2], ['C', 0, null]])
  })
  it('fewest attempts tie-break and shared ranks on full ties', () => {
    const rows = computeStandings(entries, [sub('a', 't1', 100, 10), sub('a', 't1', 50, 5), sub('b', 't1', 100, 20)], opts('theory_to_code', { tieBreak: 'fewest_attempts' }))
    expect(rows[0].name).toBe('B')
    const tied = computeStandings(entries, [sub('a', 't1', 100, 10), sub('b', 't1', 100, 10)], opts('theory_to_code'))
    expect(tied[0].rank).toBe(1)
    expect(tied[1].rank).toBe(1)
    expect(tied[0].tied).toBe(true)
  })
  it('freeze hides late submissions', () => {
    const rows = computeStandings(entries, [sub('a', 't1', 50, 10), sub('b', 't1', 100, 100)], opts('theory_to_code', { before: iso(90) }))
    expect(rows[0].name).toBe('A')
    expect(rows.find((r) => r.name === 'B')!.rank).toBeNull()
  })
  it('CTF: dynamic value from solve count, first correct per entry only', () => {
    const s = [
      sub('a', 't1', 0, 1, { detail: { correct: true } }), sub('a', 't1', 0, 2, { detail: { correct: true } }),
      sub('b', 't1', 0, 3, { detail: { correct: true } }), sub('c', 't1', 0, 4, { detail: { correct: false } }),
    ]
    const rows = computeStandings(entries, s, opts('ctf'))
    const value = ctfValue(500, 100, 2, 2)
    expect(rows.find((r) => r.name === 'A')!.total).toBe(value)
    expect(rows.find((r) => r.name === 'B')!.total).toBe(value)
    expect(rows.find((r) => r.name === 'C')!.total).toBe(0)
  })
  it('code golf: shortest passing solution gets full points', () => {
    const rows = computeStandings(entries, [
      sub('a', 't1', 0, 1, { detail: { all_passed: true, length: 40 } }),
      sub('b', 't1', 0, 2, { detail: { all_passed: true, length: 20 } }),
      sub('c', 't1', 0, 3, { detail: { all_passed: false, length: 5 } }),
    ], opts('code_golf'))
    expect(rows.map((r) => [r.name, r.total])).toEqual([['B', 100], ['A', 50], ['C', 0]])
  })
  it('datathon: lower-is-better metrics and the private board', () => {
    const s = [sub('a', '_', 0.5, 1, { private_score: 0.9 }), sub('a', '_', 0.3, 2, { private_score: 0.8 }), sub('b', '_', 0.4, 3, { private_score: 0.2 })]
    const pub = computeStandings(entries, s, opts('datathon', { direction: 'asc' }))
    expect(pub.map((r) => [r.name, r.total])).toEqual([['A', 0.3], ['B', 0.4], ['C', 0]])
    const priv = computeStandings(entries, s, opts('datathon', { direction: 'asc', usePrivate: true }))
    expect(priv[0].name).toBe('B')
    expect(rankDirection('datathon', { metric: 'rmse' })).toBe('asc')
    expect(rankDirection('datathon', { metric: 'f1' })).toBe('desc')
  })
  it('judged formats use the latest scored submission; OSS sums every PR', () => {
    const j = computeStandings(entries, [sub('a', '_', 90, 1), sub('a', '_', 60, 5), sub('b', '_', null, 2, { status: 'pending_review' })], opts('ideathon'))
    expect(j[0]).toMatchObject({ name: 'A', total: 60, rank: 1 })
    const o = computeStandings(entries, [sub('a', 't1', 10, 1), sub('a', 't2', 10, 2), sub('b', 't1', 10, 3)], opts('open_source_sprint'))
    expect(o.map((r) => [r.name, r.total])).toEqual([['A', 20], ['B', 10], ['C', 0]])
  })
})

describe('registry, feed and kinds', () => {
  it('every format has a registry entry, a feed kind that the feed knows, and a label', () => {
    expect(FORMAT_LIST.map((f) => f.id).sort()).toEqual([...CONTEST_FORMATS].sort())
    for (const f of FORMAT_LIST) {
      expect(EVENT_KINDS).toContain(f.feedKind)
      expect(KIND_LABELS[f.feedKind]).toBeTruthy()
      for (const field of [...f.top, ...(f.task?.fields || [])]) if (field.type === 'flag' || field.type === 'csv' || field.type === 'eval_cases') expect(field.secret).toBe(true)
    }
    expect(FORMATS.datathon.files?.[0].exts).toEqual(['csv'])
  })
  it('maps public contests into the internal feed with the format kind', () => {
    const rows = mapContests([{ id: 'c1', slug: 'spring-ctf', title: 'Spring CTF', summary: 'Flags', description: '', format: 'ctf', banner_url: '', schedule: { registration_opens_at: null, registration_closes_at: null, starts_at: iso(0), ends_at: iso(120), timezone: 'UTC' } }], 'https://codespectra.ai')
    expect(rows[0]).toMatchObject({ source: 'codespectra', source_id: 'contest:c1', kind: 'ctf', url: 'https://codespectra.ai/contests/spring-ctf', internal: true, featured: true })
  })
})

describe('uploads and secrets (server helpers)', () => {
  it('checks extension and magic bytes per file slot', async () => {
    const { checkFile } = await import('@/lib/contests/participation')
    const deck = FORMATS.ideathon.files![0]
    expect(checkFile(deck, { role: 'deck', name: 'pitch.pdf', bytes: new TextEncoder().encode('%PDF-1.7 ...') })).toBeNull()
    expect(checkFile(deck, { role: 'deck', name: 'pitch.pdf', bytes: new TextEncoder().encode('<html>') })).toMatch(/does not match/)
    expect(checkFile(deck, { role: 'deck', name: 'pitch.exe', bytes: new Uint8Array([1]) })).toMatch(/upload a PDF or PPTX/)
    const csv = FORMATS.datathon.files![0]
    expect(checkFile(csv, { role: 'predictions', name: 'p.csv', bytes: new TextEncoder().encode('id,target\n1,0\n') })).toBeNull()
    expect(checkFile(csv, { role: 'predictions', name: 'p.csv', bytes: new Uint8Array([0, 1, 2]) })).toMatch(/does not match/)
  })
  it('hashes CTF flags and parses datathon labels on save', async () => {
    const { prepareSecret } = await import('@/lib/contests/service')
    const secret = { salt: 'abc', top: {} as Record<string, unknown>, tasks: { t: { flag: 'flag{x}' } as Record<string, unknown> } }
    expect(prepareSecret('ctf', { tasks: [{ id: 't', title: 'T' }] }, secret)).toEqual([])
    expect(secret.tasks.t.flag).toBe(hashFlag('abc', 'flag{x}'))
    // Saving again does not double-hash.
    prepareSecret('ctf', { tasks: [{ id: 't' }] }, secret)
    expect(verifyFlag('abc', 'flag{x}', String(secret.tasks.t.flag))).toBe(true)
    const csv = ['id,target', ...Array.from({ length: 12 }, (_, i) => `${i},${i % 2}`)].join('\n')
    const ds = { salt: 's', top: { labels_csv: csv } as Record<string, unknown>, tasks: {} }
    expect(prepareSecret('datathon', { tasks: [], id_column: 'id', target_column: 'target', dataset_url: 'https://x.test/d.zip' }, ds)).toEqual([])
    expect(ds.top.labels_count).toBe(12)
    expect(ds.top).not.toHaveProperty('labels_csv')
    expect(prepareSecret('open_source_sprint', { tasks: [{ id: 'r', url: 'https://gitlab.com/a/b' }] }, { salt: 's', top: {}, tasks: {} })[0]).toMatch(/github/)
  })
})
