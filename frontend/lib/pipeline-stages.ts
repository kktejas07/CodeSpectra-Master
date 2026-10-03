/**
 * Recruitment pipeline stages — the drag-and-drop hiring funnel on the
 * assessment Pipeline page. Stored per submission as `pipeline_stage`.
 * Independent of assessment pass/fail (which is score/cutoff derived).
 */
export const PIPELINE_STAGE_IDS = [
  'none',
  'shortlisted',
  'hr',
  'technical',
  'offer',
  'hold',
  'rejected',
] as const

export type PipelineStage = (typeof PIPELINE_STAGE_IDS)[number]

export function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === 'string' && (PIPELINE_STAGE_IDS as readonly string[]).includes(value)
}
