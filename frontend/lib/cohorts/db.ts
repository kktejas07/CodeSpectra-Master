/**
 * Cohort collections (indexes built lazily, once per process):
 *  cohorts, cohort_members, cohort_sessions, cohort_attendance,
 *  cohort_assignments, cohort_submissions, cohort_certificates
 */
import 'server-only'
import { lazyCollection } from '@/lib/community/lazy'
import type { AssignmentDoc, AttendanceDoc, CohortCertificateDoc, CohortDoc, CohortMemberDoc, CohortSessionDoc, SubmissionDoc } from './types'

export const cohortsCol = lazyCollection<CohortDoc>('cohorts', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cohorts_id' }),
  c.createIndex({ status: 1, starts_at: 1 }, { name: 'cohorts_status_start' }),
  c.createIndex({ tenant_id: 1, starts_at: -1 }, { name: 'cohorts_tenant' }),
  c.createIndex({ course_id: 1 }, { name: 'cohorts_course' }),
]))

export const membersCol = lazyCollection<CohortMemberDoc>('cohort_members', (c) => Promise.all([
  c.createIndex({ cohort_id: 1, user_id: 1 }, { unique: true, name: 'cohort_members_unique' }),
  c.createIndex({ user_id: 1, status: 1 }, { name: 'cohort_members_user' }),
  c.createIndex({ cohort_id: 1, role: 1, status: 1 }, { name: 'cohort_members_role' }),
]))

export const sessionsCol = lazyCollection<CohortSessionDoc>('cohort_sessions', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cohort_sessions_id' }),
  c.createIndex({ cohort_id: 1, starts_at: 1 }, { name: 'cohort_sessions_cohort' }),
]))

export const attendanceCol = lazyCollection<AttendanceDoc>('cohort_attendance', (c) => Promise.all([
  c.createIndex({ session_id: 1, user_id: 1 }, { unique: true, name: 'cohort_attendance_unique' }),
  c.createIndex({ cohort_id: 1, user_id: 1 }, { name: 'cohort_attendance_user' }),
]))

export const assignmentsCol = lazyCollection<AssignmentDoc>('cohort_assignments', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cohort_assignments_id' }),
  c.createIndex({ cohort_id: 1, due_at: 1 }, { name: 'cohort_assignments_cohort' }),
]))

export const submissionsCol = lazyCollection<SubmissionDoc>('cohort_submissions', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cohort_submissions_id' }),
  c.createIndex({ assignment_id: 1, user_id: 1, attempt: -1 }, { name: 'cohort_submissions_attempts' }),
  c.createIndex({ cohort_id: 1, status: 1, submitted_at: 1 }, { name: 'cohort_submissions_queue' }),
  c.createIndex({ cohort_id: 1, user_id: 1 }, { name: 'cohort_submissions_user' }),
]))

export const certificatesCol = lazyCollection<CohortCertificateDoc>('cohort_certificates', (c) => Promise.all([
  c.createIndex({ cohort_id: 1, user_id: 1 }, { unique: true, name: 'cohort_certificates_unique' }),
  c.createIndex({ user_id: 1, issued_at: -1 }, { name: 'cohort_certificates_user' }),
  c.createIndex({ verify_token: 1 }, { unique: true, name: 'cohort_certificates_token' }),
]))
