/**
 * CAD task submissions — shared constants (safe for client and server).
 *
 * Flow: the candidate uploads each file on its own
 * (POST /api/exams/[id]/cad-submission/files, one file per request so each
 * stays under the 10 MB request-body cap the middleware buffers), then submits
 * the attempt with the design rationale (POST /api/exams/[id]/cad-submission).
 * The attempt lands as "pending review" with one manually graded item,
 * `CAD_TASK_QID`, which the existing grading route scores.
 */

/** Synthetic question id for the CAD task inside `exam_submissions.details`. */
export const CAD_TASK_QID = 'cad_task'

/** Points for the CAD task when the exam doesn't set `cad_points`. */
export const CAD_DEFAULT_POINTS = 100

// ponytail: files live in MongoDB (like uploaded_files) — 9 MB keeps one file
// per request under the middleware's 10 MB body buffer and far below the 16 MB
// document limit. Move to object storage if bigger models are needed.
export const CAD_MAX_FILE_BYTES = 9 * 1024 * 1024

export const CAD_RATIONALE_MIN_CHARS = 30
export const CAD_RATIONALE_MAX_CHARS = 10_000

export type CadFileKind = 'native' | 'step'

export const CAD_FILE_EXTENSIONS: Record<CadFileKind, readonly string[]> = {
  native: ['.sldprt', '.sldasm', '.ipt', '.iam', '.prt', '.catpart', '.catproduct', '.f3d', '.3dm'],
  step: ['.step', '.stp'],
}

export function cadFileExtOk(kind: CadFileKind, name: string): boolean {
  const lower = name.toLowerCase()
  return CAD_FILE_EXTENSIONS[kind].some((ext) => lower.endsWith(ext))
}

/** File metadata as returned to the candidate and to reviewers (never the bytes). */
export interface CadFileMeta {
  id: string
  kind: CadFileKind
  name: string
  size: number
  /** 'clean' = scanned OK; 'unscanned' = scanner was unreachable at upload time. */
  scan_status: 'clean' | 'unscanned'
  uploaded_at: string
}

export interface CadSubmissionInfo {
  files: CadFileMeta[]
  rationale: string
  task_code: string | null
}
