/** Client-side shapes of the cohort API responses (types only). */
import type { cohortView, gradingQueue } from '@/lib/cohorts/service'
import type { AssignmentDoc } from '@/lib/cohorts/types'

export type CohortView = Awaited<ReturnType<typeof cohortView>>
export type QueueItem = Awaited<ReturnType<typeof gradingQueue>>[number]
export type LearnerAssignment = Omit<AssignmentDoc, 'tests' | 'created_by'> & { samples?: { input: string; output: string }[]; hidden_tests?: number; tests?: AssignmentDoc['tests'] }
