/**
 * One shape for the gamification settings (audits A-026 / A-046 / A-027).
 *
 * Admin → Settings saves FLAT keys under platform_settings 'gamification'
 * (xp_daily_login, xp_submission_easy, referral_xp_bonus, streak_multiplier…),
 * while older code/data used NESTED keys (xp_rewards.easy, referral.xp_bonus,
 * referral_xp). resolveGamificationConfig reads both — flat admin keys win,
 * then legacy nested/old names, then defaults — so every reader sees what the
 * admin saved and old documents keep working without a migration.
 */

export interface GamificationConfig {
  xp_rewards: {
    easy: number; medium: number; hard: number; first_blood: number
    exam_pass: number; cert_pass: number; codeathon: number; hackathon: number
    daily_login: number; streak_7day: number; streak_30day: number
  }
  levels: Record<number, number>
  streak: { multiplier: number; freeze_enabled: boolean; max_freeze_tokens: number; freeze_every_days: number }
  referral: { xp_bonus: number; commission_percent: number }
  badges: { hackathon: boolean; exam: boolean; cert: boolean; streak: boolean }
}

export const GAMIFICATION_DEFAULT_CONFIG: GamificationConfig = {
  xp_rewards: { easy: 10, medium: 25, hard: 50, first_blood: 25, exam_pass: 50, cert_pass: 100, codeathon: 20, hackathon: 100, daily_login: 5, streak_7day: 25, streak_30day: 100 },
  levels: { 2: 100, 5: 500, 10: 2000, 20: 8000, 50: 50000 },
  streak: { multiplier: 1.5, freeze_enabled: true, max_freeze_tokens: 2, freeze_every_days: 7 },
  referral: { xp_bonus: 500, commission_percent: 10 },
  badges: { hackathon: true, exam: true, cert: true, streak: true },
}

/** Flat admin key → nested path. */
const FLAT_XP: Record<string, keyof GamificationConfig['xp_rewards']> = {
  xp_submission_easy: 'easy',
  xp_submission_medium: 'medium',
  xp_submission_hard: 'hard',
  xp_first_blood: 'first_blood',
  xp_exam_pass: 'exam_pass',
  xp_cert_pass: 'cert_pass',
  xp_codeathon: 'codeathon',
  xp_hackathon: 'hackathon',
  xp_daily_login: 'daily_login',
  xp_streak_7day: 'streak_7day',
  xp_streak_30day: 'streak_30day',
}

function num(v: unknown, lo = 0, hi = 1_000_000): number | undefined {
  const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined
}
function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}
const first = <T,>(...vals: (T | undefined)[]): T | undefined => vals.find((v) => v !== undefined)

/** Pure. */
export function resolveGamificationConfig(stored: unknown): GamificationConfig {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>
  const d = GAMIFICATION_DEFAULT_CONFIG
  const nestedXp = (s.xp_rewards && typeof s.xp_rewards === 'object' ? s.xp_rewards : {}) as Record<string, unknown>
  const xp = { ...d.xp_rewards }
  for (const k of Object.keys(xp) as (keyof typeof xp)[]) {
    const flatKey = Object.keys(FLAT_XP).find((f) => FLAT_XP[f] === k)!
    xp[k] = first(num(s[flatKey]), num(nestedXp[k])) ?? d.xp_rewards[k]
  }
  const levels: Record<number, number> = { ...d.levels }
  const nestedLevels = (s.levels && typeof s.levels === 'object' ? s.levels : {}) as Record<string, unknown>
  for (const lvl of Object.keys(d.levels).map(Number)) {
    levels[lvl] = first(num(s[`level_${lvl}_xp`]), num(nestedLevels[lvl])) ?? d.levels[lvl]
  }
  const nestedStreak = (s.streak && typeof s.streak === 'object' ? s.streak : {}) as Record<string, unknown>
  const nestedRef = (s.referral && typeof s.referral === 'object' ? s.referral : {}) as Record<string, unknown>
  const nestedBadges = (s.badges && typeof s.badges === 'object' ? s.badges : {}) as Record<string, unknown>
  return {
    xp_rewards: xp,
    levels,
    streak: {
      multiplier: first(num(s.streak_multiplier, 1, 10), num(nestedStreak.multiplier, 1, 10)) ?? d.streak.multiplier,
      freeze_enabled: first(bool(s.streak_freeze_enabled), bool(nestedStreak.freeze_enabled)) ?? d.streak.freeze_enabled,
      max_freeze_tokens: first(num(s.streak_max_freeze_tokens, 0, 10), num(nestedStreak.max_freeze_tokens, 0, 10)) ?? d.streak.max_freeze_tokens,
      freeze_every_days: first(num(s.streak_freeze_every_days, 1, 365), num(nestedStreak.freeze_every_days, 1, 365)) ?? d.streak.freeze_every_days,
    },
    referral: {
      xp_bonus: first(num(s.referral_xp_bonus, 1), num(s.referral_xp, 1), num(nestedRef.xp_bonus, 1)) ?? d.referral.xp_bonus,
      commission_percent: first(num(s.referral_commission_percent, 0, 100), num(nestedRef.commission_percent, 0, 100)) ?? d.referral.commission_percent,
    },
    badges: {
      hackathon: first(bool(s.badge_hackathon_enabled), bool(nestedBadges.hackathon)) ?? d.badges.hackathon,
      exam: first(bool(s.badge_exam_enabled), bool(nestedBadges.exam)) ?? d.badges.exam,
      cert: first(bool(s.badge_cert_enabled), bool(nestedBadges.cert)) ?? d.badges.cert,
      streak: first(bool(s.badge_streak_enabled), bool(nestedBadges.streak)) ?? d.badges.streak,
    },
  }
}

let _cache: { at: number; cfg: GamificationConfig } | null = null
const TTL_MS = 30_000

export async function getGamificationConfig(): Promise<GamificationConfig> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.cfg
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const doc = await (await getMongoDb()).collection('platform_settings').findOne({ key: 'gamification' })
    const cfg = resolveGamificationConfig(doc?.value)
    _cache = { at: Date.now(), cfg }
    return cfg
  } catch {
    return GAMIFICATION_DEFAULT_CONFIG
  }
}

export function invalidateGamificationConfig(): void {
  _cache = null
}

// ─── Login streak: freezes + multiplier (A-027) ─────────────────────────────

const DAY_MS = 86_400_000
function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
}

export interface StreakStep {
  streak: number
  freezeTokens: number
  /** Freeze tokens spent to cover missed days on this login. */
  freezesUsed: number
  /** True when the streak broke and restarted at 1. */
  reset: boolean
}

/**
 * Next streak state for a login on `today` (YYYY-MM-DD, UTC). Pure.
 *  - consecutive day → streak + 1
 *  - missed days with streak freeze on → one token per missed day keeps the
 *    streak going (if the user holds enough tokens); otherwise it restarts.
 *  - tokens: one earned every `freeze_every_days` days of streak, up to
 *    `max_freeze_tokens`.
 */
export function nextLoginStreak(input: {
  lastDay: string | null
  today: string
  streak: number
  freezeTokens: number
  config: Pick<GamificationConfig['streak'], 'freeze_enabled' | 'max_freeze_tokens' | 'freeze_every_days'>
}): StreakStep {
  const tokens = Math.max(0, Math.floor(input.freezeTokens || 0))
  const prev = Math.max(0, Math.floor(input.streak || 0))
  let streak = 1
  let freezesUsed = 0
  let reset = prev > 0
  let left = tokens
  if (input.lastDay) {
    const gap = dayNumber(input.today) - dayNumber(input.lastDay)
    if (gap <= 0) return { streak: Math.max(1, prev), freezeTokens: tokens, freezesUsed: 0, reset: false }
    const missed = gap - 1
    if (missed === 0) {
      streak = prev + 1
      reset = false
    } else if (input.config.freeze_enabled && missed <= tokens) {
      streak = prev + 1
      freezesUsed = missed
      left = tokens - missed
      reset = false
    }
  }
  if (!input.config.freeze_enabled) left = 0
  else if (streak > 1 && streak % Math.max(1, input.config.freeze_every_days) === 0) {
    left = Math.min(input.config.max_freeze_tokens, left + 1)
  }
  return { streak, freezeTokens: left, freezesUsed, reset: reset && streak === 1 }
}

/**
 * XP for a daily login. Pure. The streak multiplier applies to the daily
 * login XP once the streak is at least 7 days; milestone bonuses at 7 / 30.
 */
export function loginXp(cfg: GamificationConfig, streak: number): { dailyXp: number; streakBonus: number } {
  const base = cfg.xp_rewards.daily_login
  const dailyXp = Math.round(streak >= 7 ? base * cfg.streak.multiplier : base)
  const streakBonus = streak === 7 ? cfg.xp_rewards.streak_7day : streak === 30 ? cfg.xp_rewards.streak_30day : 0
  return { dailyXp, streakBonus }
}
