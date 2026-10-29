/**
 * One shape for challenge rows.
 *
 * The API seeds wrote `duration_minutes` / `success_rate` while the dashboard
 * card reads `duration` / `successRate`, so every seeded challenge rendered
 * "undefined min". Two seeders also used different field names. Normalising
 * here means the UI contract holds whatever wrote the row.
 */
export interface ChallengeRow {
  id: string
  title: string
  description: string
  difficulty: string
  type: string
  duration: number
  successRate: number
  completed: boolean
  locked: boolean
  prerequisites: string[]
}

const DEFAULT_DURATION = 15
const DEFAULT_SUCCESS_RATE = 50

function num(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : Number(c)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function normalizeChallengeRow(doc: Record<string, unknown>): ChallengeRow {
  const id = String(doc.id ?? doc.slug ?? doc._id ?? '')
  return {
    id,
    title: String(doc.title ?? ''),
    description: String(doc.description ?? ''),
    difficulty: String(doc.difficulty ?? 'medium'),
    type: String(doc.type ?? 'technical'),
    // Both spellings accepted: pre-existing rows use the *_minutes/_rate form.
    duration: num(doc.duration, doc.duration_minutes) ?? DEFAULT_DURATION,
    successRate: num(doc.successRate, doc.success_rate) ?? DEFAULT_SUCCESS_RATE,
    completed: Boolean(doc.completed),
    locked: Boolean(doc.locked),
    prerequisites: Array.isArray(doc.prerequisites) ? doc.prerequisites.map(String) : [],
  }
}
