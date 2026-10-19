import { GAMIFICATION_DEFAULT_CONFIG } from '@/lib/gamification-config'

export const MAX_LEVEL = 99

/** Sorted (level, xp) anchors from the admin's level thresholds (Settings → Gamification). */
function anchors(levels: Record<number, number>): Array<[number, number]> {
  const pts = Object.entries(levels || {})
    .map(([l, x]) => [Number(l), Number(x)] as [number, number])
    .filter(([l, x]) => Number.isInteger(l) && l >= 2 && l <= MAX_LEVEL && Number.isFinite(x) && x > 0)
    .sort((a, b) => a[0] - b[0])
  // Thresholds must rise with the level; drop any that don't.
  const out: Array<[number, number]> = [[1, 0]]
  for (const p of pts) if (p[1] > out[out.length - 1][1]) out.push(p)
  return out
}

/**
 * XP needed to reach `level` (CORE-003). The admin sets anchor levels
 * (default 2 → 100, 5 → 500, 10 → 2,000, 20 → 8,000, 50 → 50,000); levels in
 * between are spaced evenly, and past the last anchor each level costs the
 * same as one level of the last segment.
 */
export function levelThresholdXp(level: number, levels: Record<number, number> = GAMIFICATION_DEFAULT_CONFIG.levels): number {
  const a = anchors(levels)
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  for (let i = 1; i < a.length; i++) {
    const [l0, x0] = a[i - 1]
    const [l1, x1] = a[i]
    if (L <= l1) return Math.round(x0 + ((x1 - x0) * (L - l0)) / (l1 - l0))
  }
  const [lp, xp] = a.length > 1 ? a[a.length - 2] : [1, 0]
  const [ll, xl] = a[a.length - 1]
  const step = a.length > 1 ? (xl - xp) / Math.max(1, ll - lp) : 100
  return Math.round(xl + step * (L - ll))
}

/** Level (1–99) for an XP total, from the admin's level thresholds. */
export function xpToLevel(xp: number, levels: Record<number, number> = GAMIFICATION_DEFAULT_CONFIG.levels): number {
  const x = Math.max(0, Number(xp) || 0)
  let lvl = 1
  while (lvl < MAX_LEVEL && x >= levelThresholdXp(lvl + 1, levels)) lvl++
  return lvl
}

export function rankTitle(rank: number): string {
  if (rank === 1) return 'GRANDMASTER'
  if (rank === 2) return 'SILVER ARCHITECT'
  if (rank === 3) return 'BRONZE LEAD'
  if (rank <= 10) return 'ELITE CONTRIBUTOR'
  if (rank <= 25) return 'CHAMPION'
  if (rank <= 50) return 'VETERAN'
  return 'RISING STAR'
}

export function languageLabel(raw: string | null | undefined): string {
  if (!raw) return '—'
  const s = raw.toLowerCase()
  const map: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    go: 'Go',
    rust: 'Rust',
    ruby: 'Ruby',
    sql: 'SQL',
    react: 'React',
  }
  return map[s] || s.charAt(0).toUpperCase() + s.slice(1)
}

export function languageBadgeClass(lang: string): string {
  const s = lang.toLowerCase()
  if (s.includes('python')) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  if (s.includes('rust')) return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
  if (s.includes('typescript')) return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
  if (s.includes('c++') || s === 'cpp') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  return 'bg-primary/10 text-primary border-primary/25'
}
