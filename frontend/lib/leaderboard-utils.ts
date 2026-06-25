/** Map XP to a display level (1–99) for UI bars — not game logic, presentation only. */
export function xpToLevel(xp: number): number {
  const x = Math.max(0, xp)
  const lvl = Math.floor(Math.sqrt(x / 40))
  return Math.min(99, Math.max(1, lvl))
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
  const s = (raw || 'javascript').toLowerCase()
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
