/**
 * Wave-3 audit fixes: gamification settings (A-026/A-046/A-027), leaderboard
 * cache (A-047), shared scheduler (A-018/A-019/A-020/A-045), identity media
 * (A-011/A-042), code-quality sanity (A-055), candidate WhatsApp route
 * (A-031), demo BGV vendor (A-034).
 */
import { describe, expect, it } from 'vitest'

describe('gamification settings: one shape for admin + readers (A-026, A-046)', () => {
  it('flat admin keys win over legacy nested keys and defaults', async () => {
    const { resolveGamificationConfig } = await import('@/lib/gamification-config')
    const c = resolveGamificationConfig({
      xp_daily_login: 9, xp_submission_easy: 12, referral_xp_bonus: 750, streak_multiplier: 2, streak_freeze_enabled: false, level_5_xp: 600,
      xp_rewards: { easy: 1, daily_login: 1 }, referral: { xp_bonus: 1 },
    })
    expect(c.xp_rewards.daily_login).toBe(9)
    expect(c.xp_rewards.easy).toBe(12)
    expect(c.referral.xp_bonus).toBe(750)
    expect(c.streak).toMatchObject({ multiplier: 2, freeze_enabled: false })
    expect(c.levels[5]).toBe(600)
  })
  it('old documents (nested / referral_xp) still work; junk falls back to defaults', async () => {
    const { resolveGamificationConfig, GAMIFICATION_DEFAULT_CONFIG } = await import('@/lib/gamification-config')
    const c = resolveGamificationConfig({ xp_rewards: { hard: 70 }, referral_xp: 300, streak_multiplier: 'abc', xp_daily_login: -5 })
    expect(c.xp_rewards.hard).toBe(70)
    expect(c.referral.xp_bonus).toBe(300)
    expect(c.streak.multiplier).toBe(GAMIFICATION_DEFAULT_CONFIG.streak.multiplier)
    expect(c.xp_rewards.daily_login).toBe(5)
    expect(resolveGamificationConfig(null)).toEqual(GAMIFICATION_DEFAULT_CONFIG)
  })
})

describe('login streak freezes + multiplier (A-027)', () => {
  const cfg = { freeze_enabled: true, max_freeze_tokens: 2, freeze_every_days: 7 }
  it('consecutive days grow the streak and earn a freeze every 7 days', async () => {
    const { nextLoginStreak } = await import('@/lib/gamification-config')
    expect(nextLoginStreak({ lastDay: '2026-10-18', today: '2026-10-19', streak: 6, freezeTokens: 0, config: cfg })).toEqual({ streak: 7, freezeTokens: 1, freezesUsed: 0, reset: false })
    expect(nextLoginStreak({ lastDay: null, today: '2026-10-19', streak: 0, freezeTokens: 0, config: cfg })).toMatchObject({ streak: 1, reset: false })
  })
  it('a missed day consumes a freeze token instead of resetting', async () => {
    const { nextLoginStreak } = await import('@/lib/gamification-config')
    expect(nextLoginStreak({ lastDay: '2026-10-17', today: '2026-10-19', streak: 10, freezeTokens: 1, config: cfg })).toEqual({ streak: 11, freezeTokens: 0, freezesUsed: 1, reset: false })
  })
  it('too many missed days (or freezes off) resets the streak', async () => {
    const { nextLoginStreak } = await import('@/lib/gamification-config')
    expect(nextLoginStreak({ lastDay: '2026-10-15', today: '2026-10-19', streak: 10, freezeTokens: 2, config: cfg })).toMatchObject({ streak: 1, freezeTokens: 2, reset: true })
    expect(nextLoginStreak({ lastDay: '2026-10-17', today: '2026-10-19', streak: 10, freezeTokens: 2, config: { ...cfg, freeze_enabled: false } })).toMatchObject({ streak: 1, freezeTokens: 0, reset: true })
  })
  it('multiplier applies to daily login XP from a 7-day streak; milestones at 7 and 30', async () => {
    const { loginXp, resolveGamificationConfig } = await import('@/lib/gamification-config')
    const c = resolveGamificationConfig({ xp_daily_login: 10, streak_multiplier: 1.5, xp_streak_7day: 25, xp_streak_30day: 100 })
    expect(loginXp(c, 3)).toEqual({ dailyXp: 10, streakBonus: 0 })
    expect(loginXp(c, 7)).toEqual({ dailyXp: 15, streakBonus: 25 })
    expect(loginXp(c, 30)).toEqual({ dailyXp: 15, streakBonus: 100 })
  })
})

describe('leaderboard snapshot (A-047)', () => {
  it('ranks from the cached totals', async () => {
    const { buildSnapshot, countAbove } = await import('@/lib/leaderboard-cache')
    const s = buildSnapshot([
      { userId: 'b', xp: 50, solved: 1, last: null },
      { userId: 'a', xp: 100, solved: 2, last: null },
      { userId: 'c', xp: 50, solved: 0, last: null },
      { userId: 'z', xp: 0, solved: 0, last: null },
    ])
    expect(s.top.map((t) => t.userId)).toEqual(['a', 'b', 'c'])
    expect(s.byUser.get('z')).toBeUndefined()
    expect(countAbove(s.xpDesc, 100)).toBe(0)
    expect(countAbove(s.xpDesc, 50)).toBe(1)
    expect(countAbove(s.xpDesc, 10)).toBe(3)
  })
})

describe('shared scheduler: scheduled cron routes (A-019)', () => {
  it('runs a route at its cron minute unless it already ran recently', async () => {
    const { scheduledRouteDue, SCHEDULED_ROUTES } = await import('@/lib/platform-cron')
    const daily = SCHEDULED_ROUTES.find((r) => r.id === 'daily-digest')!
    const at8 = new Date('2026-10-19T08:00:00Z')
    expect(scheduledRouteDue(daily, at8, null)).toBe(true)
    // AUTO-087: a missed slot is caught up on the first tick after it (within the catch-up window)…
    expect(scheduledRouteDue(daily, new Date('2026-10-19T08:01:00Z'), null)).toBe(true)
    // …but not half a day later.
    expect(scheduledRouteDue(daily, new Date('2026-10-19T20:01:00Z'), null)).toBe(false)
    // An external cron already ran it 2 minutes ago → skip (no double digest).
    expect(scheduledRouteDue(daily, at8, '2026-10-19T07:58:00Z')).toBe(false)
    expect(scheduledRouteDue(daily, at8, '2026-10-18T08:00:00Z')).toBe(true)
    const ids = SCHEDULED_ROUTES.map((r) => r.id).sort()
    expect(ids).toEqual(['daily-digest', 'ebooks-daily', 'exam-reminders', 'security-scan', 'signals-ingest', 'status-check', 'weekly-digest'])
  })
})

describe('identity media (A-011, A-042)', () => {
  it('parses image data URLs and media refs', async () => {
    const { parseImageDataUrl, isMediaRef, mediaIdFromRef } = await import('@/lib/identity-media')
    expect(parseImageDataUrl('data:image/jpg;base64,AAAA')?.mime).toBe('image/jpeg')
    expect(parseImageDataUrl('data:text/html;base64,AAAA')).toBeNull()
    expect(isMediaRef('media:abcdef123456')).toBe(true)
    expect(isMediaRef('media:../../x')).toBe(false)
    expect(mediaIdFromRef('data:image/png;base64,AA')).toBeNull()
  })
  it('view tokens are bound to the viewer and expire after 5 minutes', async () => {
    const { signMediaToken, verifyMediaToken, MEDIA_URL_TTL_MS } = await import('@/lib/identity-media')
    const k = new Uint8Array(32).fill(7)
    const now = 1_000_000
    const t = signMediaToken(k, 'm1', 'staff1', now)
    expect(verifyMediaToken(k, t, now + 1000)).toEqual({ mediaId: 'm1', viewerId: 'staff1' })
    expect(verifyMediaToken(k, t, now + MEDIA_URL_TTL_MS + 1)).toBeNull()
    expect(verifyMediaToken(new Uint8Array(32).fill(8), t, now)).toBeNull()
  })
  it('exam close time: end date, else archive date, else none', async () => {
    const { examCloseAt } = await import('@/lib/identity-media')
    expect(examCloseAt({ ends_at: '2026-01-01T00:00:00Z' })).toBe(Date.parse('2026-01-01T00:00:00Z'))
    expect(examCloseAt({ status: 'archived', updatedAt: '2026-02-01T00:00:00Z' })).toBe(Date.parse('2026-02-01T00:00:00Z'))
    expect(examCloseAt({ status: 'available' })).toBeNull()
  })
  it('face sign-in accepts sealed templates', async () => {
    const { faceSignInAllowed } = await import('@/lib/auth-trusted-device')
    expect(faceSignInAllowed({ facial_biometric_template: 'v1.' + 'A'.repeat(200) })).toBe(true)
    expect(faceSignInAllowed({ facial_biometric_template: 'garbage' })).toBe(false)
  })
})

describe('code-quality sanity (A-055)', () => {
  it('punctuation-heavy prose is not scored as perfect code', async () => {
    const { analyzeCodeLocally, codeSanity } = await import('@/lib/local-code-analyzer')
    for (const text of [
      'hello world (this is random text) = 100; and more text here that is not code.',
      'The quick brown fox (jumps) over the lazy dog; then {it} runs = away & home!',
      'asdf qwer zxcv; ( ) = ; {} lorem ipsum dolor sit amet',
    ]) {
      expect(codeSanity(text).ok).toBe(false)
      expect(analyzeCodeLocally(text, 'javascript').quality).toBe(0)
    }
  })
  it('real code still scores', async () => {
    const { analyzeCodeLocally } = await import('@/lib/local-code-analyzer')
    expect(analyzeCodeLocally('function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));', 'javascript').quality).toBeGreaterThan(50)
    expect(analyzeCodeLocally('def add(a, b):\n    return a + b\n\nprint(add(1, 2))', 'python').quality).toBeGreaterThan(50)
    expect(analyzeCodeLocally('SELECT id, name FROM users WHERE id = 1;', 'sql').quality).toBeGreaterThan(0)
  })
})

describe('candidate WhatsApp channel (A-031)', () => {
  it('official Meta API when configured; unofficial only when opted in', async () => {
    const { candidateWhatsAppRoute } = await import('@/lib/ats/notify')
    expect(candidateWhatsAppRoute({ metaReady: true, phoneNumberId: 'pn1', unofficialEnabled: true })).toBe('meta')
    expect(candidateWhatsAppRoute({ metaReady: false, phoneNumberId: null, unofficialEnabled: false })).toBe('none')
    expect(candidateWhatsAppRoute({ metaReady: true, phoneNumberId: null, unofficialEnabled: false })).toBe('none')
    expect(candidateWhatsAppRoute({ metaReady: false, phoneNumberId: null, unofficialEnabled: true })).toBe('unofficial')
  })
})

describe('demo BGV vendor (A-034)', () => {
  it('is hidden unless allowed, and marked demo when shown', async () => {
    const { vendorsFor } = await import('@/lib/ats/bgv/vendors')
    expect(vendorsFor('IN', { allowSimulated: false }).some((v) => v.id === 'simulated')).toBe(false)
    expect(vendorsFor('IN', { allowSimulated: true }).find((v) => v.id === 'simulated')).toMatchObject({ demo: true })
  })
})
