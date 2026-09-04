import type { ReadonlyURLSearchParams } from 'next/navigation'

export type LearningView = 'all' | 'my-courses' | 'saved'

export type LearningLevel = 'all' | 'beginner' | 'intermediate' | 'advanced'

export type LearningType = 'all' | 'video' | 'audio' | 'text'

const VIEWS: readonly LearningView[] = ['all', 'my-courses', 'saved']
const LEVELS: readonly LearningLevel[] = ['all', 'beginner', 'intermediate', 'advanced']
const TYPES: readonly LearningType[] = ['all', 'video', 'audio', 'text']

export const LEARNING_HUB_DEFAULT = '/dashboard/courses'

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

/** Build `/dashboard/courses` URL; merges with current query unless overrides are passed. */
export function learningHref(
  current: ReadonlyURLSearchParams | null,
  updates: Partial<{ view: LearningView; level: LearningLevel; type: LearningType }>
): string {
  const base = parseLearningParams(current)
  const view = updates.view ?? base.view
  const level = updates.level ?? base.level
  const type = updates.type ?? base.type
  const params = new URLSearchParams()
  if (view !== 'all') params.set('view', view)
  if (level !== 'all') params.set('level', level)
  if (type !== 'all') params.set('type', type)
  
  const query = params.toString()
  return query ? `/dashboard/courses?${query}` : '/dashboard/courses'
}
