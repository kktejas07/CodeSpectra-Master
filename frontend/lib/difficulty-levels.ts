/** Shared difficulty level constants for the entire platform.
 *  Import from here — do not redefine locally. */

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number]

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

/** Tailwind classes for difficulty badges — reuse shadcn Badge variant="outline". */
export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  beginner: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  intermediate: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  advanced: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  expert: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
}

/** Normalise any level string to our canonical enum key (returns undefined if unrecognised). */
export function toDifficultyLevel(raw: string | undefined | null): DifficultyLevel | undefined {
  const lv = (raw || '').toLowerCase().trim() as DifficultyLevel
  return (DIFFICULTY_LEVELS as readonly string[]).includes(lv) ? lv : undefined
}
