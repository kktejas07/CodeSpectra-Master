import { isCourseComplete } from '@/lib/courses/course-images'

export type CourseJobRef = { status: string; startedAt?: string }

export type CourseStatus =
  | 'ready'
  | 'incomplete'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'cancelled'

/**
 * Effective catalog status of a course. Courses store NO status field — the
 * source of truth is what the generation jobs did + whether the media is
 * actually complete. "Ready" is what makes a course visible to learners.
 */
export function courseStatus(
  course: { sections?: unknown; modules?: unknown; type?: string },
  jobs: CourseJobRef[] = [],
): CourseStatus {
  if (jobs.some(j => j.status === 'running')) return 'processing'
  if (jobs.some(j => j.status === 'pending')) return 'queued'

  const terminal = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
  if (terminal.length === 0) {
    // No video job has ever run for this course.
    return isCourseComplete(course) ? 'ready' : 'incomplete'
  }

  const last = terminal.sort((a, b) =>
    String(b.startedAt || '').localeCompare(String(a.startedAt || '')),
  )[0]
  if (last.status === 'failed') return 'failed'
  if (last.status === 'cancelled') return 'cancelled'
  // Latest job completed; the course may still be short of videos (a retry
  // produced some but not all). Completeness, not the job, is the test.
  return isCourseComplete(course) ? 'ready' : 'incomplete'
}

export const COURSE_STATUS_META: Record<CourseStatus, { label: string; className: string }> = {
  ready: { label: 'Published', className: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300' },
  incomplete: { label: 'Draft', className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  queued: { label: 'Pending', className: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  processing: { label: 'Running', className: 'border-primary/40 bg-primary/10 text-primary' },
  failed: { label: 'Failed', className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300' },
  cancelled: { label: 'Cancelled', className: 'border-border bg-muted text-muted-foreground' },
}

/** Values that make a course visible to learners (used by the catalog filter). */
export const PUBLISHED_STATUSES: CourseStatus[] = ['ready']
