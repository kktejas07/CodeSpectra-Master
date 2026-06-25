import type { ReadonlyURLSearchParams } from 'next/navigation'

export type LearningView = 'all' | 'my-courses' | 'saved'

export type LearningLevel = 'all' | 'beginner' | 'intermediate' | 'advanced'

export type LearningType = 'all' | 'video' | 'audio' | 'text'

const VIEWS: readonly LearningView[] = ['all', 'my-courses', 'saved']
const LEVELS: readonly LearningLevel[] = ['all', 'beginner', 'intermediate', 'advanced']
const TYPES: readonly LearningType[] = ['all', 'video', 'audio', 'text']

export const LEARNING_HUB_DEFAULT = '/dashboard/learning?view=all&level=all&type=all'

function parseView(raw: string | null): LearningView {
  if (raw && (VIEWS as readonly string[]).includes(raw)) return raw as LearningView
  return 'all'
}

function parseLevel(raw: string | null): LearningLevel {
  if (raw && (LEVELS as readonly string[]).includes(raw)) return raw as LearningLevel
  return 'all'
}

function parseType(raw: string | null): LearningType {
  if (raw && (TYPES as readonly string[]).includes(raw)) return raw as LearningType
  return 'all'
}

export function parseLearningParams(sp: ReadonlyURLSearchParams | null): {
  view: LearningView
  level: LearningLevel
  type: LearningType
} {
  if (!sp) {
    return { view: 'all', level: 'all', type: 'all' }
  }
  return {
    view: parseView(sp.get('view')),
    level: parseLevel(sp.get('level')),
    type: parseType(sp.get('type')),
  }
}

/** Build `/dashboard/learning` URL; merges with current query unless overrides are passed. */
export function learningHref(
  current: ReadonlyURLSearchParams | null,
  updates: Partial<{ view: LearningView; level: LearningLevel; type: LearningType }>
): string {
  const base = parseLearningParams(current)
  const view = updates.view ?? base.view
  const level = updates.level ?? base.level
  const type = updates.type ?? base.type
  return `/dashboard/learning?view=${encodeURIComponent(view)}&level=${encodeURIComponent(level)}&type=${encodeURIComponent(type)}`
}
