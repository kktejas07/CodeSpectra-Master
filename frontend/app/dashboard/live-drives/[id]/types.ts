import type { CandidateState, DriveRules, DriveSchedule, EffectiveDriveStatus, GridStatus, Invigilator, LiveDriveStatus } from '@/lib/live-drives/types'

export interface DriveView {
  id: string
  title: string
  role: 'owner' | 'invigilator'
  status: LiveDriveStatus
  effective_status: EffectiveDriveStatus
  owner: { kind: 'college' | 'company'; tenant_id: string; name: string }
  links: { campus_drive_id: string | null; ats_job_id: string | null }
  test: { pattern_id: string; level: string; exam_name: string; company_name: string }
  schedule: DriveSchedule
  rules: DriveRules
  invigilators: Invigilator[]
  candidate_count: number
  paper_built_at: string | null
  results: { scored_at: string | null; published_at: string | null; published_count: number }
}

export interface GridRow {
  id: string; name: string; email: string; group_no: number; invigilator_id: string | null
  status: GridStatus; state: CandidateState; answered: number; flags: number; flagged_reason: string | null
  remaining_ms: number | null; last_seen_at: string | null; disconnects: number; check_passed: boolean | null
}

export interface ControlData {
  drive: DriveView
  counts: Record<GridStatus, number>
  total: number
  groups: { group_no: number; invigilator: string | null }[]
  rows: GridRow[]
  matching: number
  page: number
  page_size: number
  flags: { candidate_id: string | null; name: string; group_no: number; type: string; at: number; received_at: number }[]
  cursor: number
}
