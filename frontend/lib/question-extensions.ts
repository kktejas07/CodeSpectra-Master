/**
 * Wave 6 question fields — theory_to_code, reverse_coding, system_design,
 * case_study, video_response, file_upload, typing_test, aptitude areas and
 * psychometric (trait-keyed Likert) items.
 *
 * Pure and client-safe. Three jobs:
 *  - {@link sanitizeExtendedQuestionFields}: the write-path guard (called from
 *    lib/grading.ts sanitizeExamQuestion), so only known scalar shapes reach
 *    MongoDB.
 *  - {@link candidateExtendedFields}: what a candidate may see (no rubric, no
 *    reference solution, no sub-question keys, no trait keys).
 *  - Answer envelopes ({@link parseJsonAnswer}) shared by the UI and graders.
 *
 * Answer encodings (strings, like every other type):
 *  - system_design  `{"text":"…","diagram":"…"}`
 *  - case_study     `{"<subId>":"value" | ["a","b"]}`
 *  - typing_test    `{"typed":"…","elapsed_ms":123456}`
 *  - file_upload    `{"file_id":"…","name":"…","size":123,"type":"pdf"}`
 *  - video_response `{"file_id":"…","name":"…","size":123,"duration_s":42}` or `{"text_alternative":"…"}`
 *  - theory_to_code / reverse_coding  `{"language":"…","code":"…"}` (as coding)
 */
import type { ExamSection } from '@/lib/exam-sections'
import { canonicalType, type QuestionType } from '@/lib/question-types'

// ─── Field shapes ────────────────────────────────────────────────────────────

export type AptitudeArea = 'quant' | 'logical' | 'verbal'
export const APTITUDE_AREAS: { id: AptitudeArea; label: string }[] = [
  { id: 'quant', label: 'Quantitative' },
  { id: 'logical', label: 'Logical reasoning' },
  { id: 'verbal', label: 'Verbal ability' },
]

/** Sub-question types a case study may use (deterministic, marked instantly). */
export const CASE_SUB_TYPES = ['mcq', 'multiple_response', 'true_false', 'yes_no', 'fill_blanks', 'numeric', 'short_answer'] as const
export type CaseSubType = (typeof CASE_SUB_TYPES)[number]

export interface CaseSubQuestion {
  id: string
  type: CaseSubType
  prompt: string
  options?: string[]
  answer?: string
  tolerance?: number
  points: number
}

export interface UploadConfig {
  /** Ids from {@link UPLOAD_FILE_KINDS}. */
  allowed: string[]
  max_mb: number
}

export interface VideoConfig {
  max_seconds: number
  retakes: number
  /** Accessibility: a typed answer instead of a recording. */
  allow_text_alternative: boolean
}

export interface TypingConfig {
  passage: string
  min_wpm: number
  /** 0-100 */
  min_accuracy: number
  /** Optional per-attempt cap; the typing box stops after this. */
  time_limit_seconds?: number
}

export interface ExtendedQuestionFields {
  aptitude_area?: AptitudeArea
  /** Likert: the trait this item measures (psychometric scoring). */
  trait?: string
  /** Likert: agreement counts against the trait (score = min + max − value). */
  reverse_scored?: boolean
  /** system_design: what a strong answer covers (staff only). */
  rubric?: string
  /** system_design: show a diagram (text / mermaid) box. */
  allow_diagram?: boolean
  /** case_study: linked sub-questions. */
  sub_questions?: CaseSubQuestion[]
  /** reverse_coding: hidden reference used by the black-box runner (staff only). */
  reference_solution?: { language: string; code: string }
  /** reverse_coding: black-box runs per candidate per hour; 0/absent = no runner. */
  black_box_runs?: number
  upload?: UploadConfig
  video?: VideoConfig
  typing?: TypingConfig
}

// ─── Limits ──────────────────────────────────────────────────────────────────

/** One file per request stays under the 10 MB body the middleware buffers. */
export const ANSWER_FILE_MAX_MB = 9
export const VIDEO_MAX_SECONDS = 300
export const BLACK_BOX_MAX_RUNS = 50
export const BLACK_BOX_INPUT_MAX = 2000
const MAX_SUB_QUESTIONS = 10
const MAX_PASSAGE = 5000

/**
 * File kinds an author may allow on a file_upload question. `sniff` names the
 * magic-byte check in lib/upload-sniff.ts (sniffAnswerFile).
 */
export const UPLOAD_FILE_KINDS: { id: string; label: string; exts: string[] }[] = [
  { id: 'pdf', label: 'PDF', exts: ['.pdf'] },
  { id: 'image', label: 'Image (PNG, JPEG, WebP, GIF)', exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
  { id: 'docx', label: 'Word (.docx)', exts: ['.docx'] },
  { id: 'xlsx', label: 'Excel (.xlsx)', exts: ['.xlsx'] },
  { id: 'pptx', label: 'PowerPoint (.pptx)', exts: ['.pptx'] },
  { id: 'zip', label: 'ZIP archive', exts: ['.zip'] },
  { id: 'text', label: 'Text / code / CSV', exts: ['.txt', '.md', '.csv', '.json', '.py', '.js', '.ts', '.java', '.c', '.cpp', '.go', '.rb', '.sql', '.log', '.yaml', '.yml'] },
]
export const VIDEO_FILE_EXTS = ['.webm', '.mp4']

/** Upload kind for a file name among the allowed ids, or null. */
export function uploadKindForName(name: string, allowed: readonly string[]): string | null {
  const lower = name.toLowerCase()
  for (const k of UPLOAD_FILE_KINDS) {
    if (allowed.includes(k.id) && k.exts.some((e) => lower.endsWith(e))) return k.id
  }
  return null
}

/** `accept` attribute for a file input. */
export function acceptForKinds(allowed: readonly string[]): string {
  return UPLOAD_FILE_KINDS.filter((k) => allowed.includes(k.id)).flatMap((k) => k.exts).join(',')
}

// ─── Sanitizer (write path) ──────────────────────────────────────────────────

function str(v: unknown, max: number): string {
  if (typeof v === 'string') return v.slice(0, max)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max)
  return ''
}
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function cleanSubId(v: unknown, i: number): string {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : `s${i + 1}`
}

export function sanitizeSubQuestions(raw: unknown): CaseSubQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: CaseSubQuestion[] = []
  const used = new Set<string>()
  for (const [i, item] of raw.slice(0, MAX_SUB_QUESTIONS).entries()) {
    if (!isObj(item)) continue
    const prompt = str(item.prompt ?? item.question, 4000).trim()
    if (!prompt) continue
    let id = cleanSubId(item.id, i)
    while (used.has(id)) id = `${id}_${i + 1}`
    used.add(id)
    const resolved = canonicalType(str(item.type, 40), 'short_answer')
    const type: CaseSubType = (CASE_SUB_TYPES as readonly string[]).includes(resolved) ? (resolved as CaseSubType) : 'short_answer'
    const sub: CaseSubQuestion = { id, type, prompt, points: Math.round(num(item.points ?? item.score, 1, 100, 5)) }
    if (Array.isArray(item.options)) {
      const opts = item.options.slice(0, 12).map((o) => str(o, 500)).filter(Boolean)
      if (opts.length) sub.options = opts
    }
    if (type === 'true_false' && !sub.options) sub.options = ['True', 'False']
    if (type === 'yes_no' && !sub.options) sub.options = ['Yes', 'No']
    const answer = str(item.answer ?? item.correct_answer, 2000)
    if (answer) sub.answer = answer
    const tol = Number(item.tolerance)
    if (type === 'numeric' && Number.isFinite(tol) && tol > 0) sub.tolerance = tol
    out.push(sub)
  }
  return out
}

/**
 * Copy the wave-6 fields from an untrusted question payload onto `clean`,
 * keeping only known shapes. Absent fields stay absent.
 */
export function sanitizeExtendedQuestionFields(q: Record<string, unknown>, clean: Record<string, unknown>): void {
  const area = str(q.aptitude_area, 20).toLowerCase()
  if (area === 'quant' || area === 'logical' || area === 'verbal') clean.aptitude_area = area

  const trait = str(q.trait, 60).trim()
  if (trait) clean.trait = trait
  if (q.reverse_scored === true) clean.reverse_scored = true

  const rubric = str(q.rubric, 8000).trim()
  if (rubric) clean.rubric = rubric
  if (q.allow_diagram === true) clean.allow_diagram = true

  const subs = sanitizeSubQuestions(q.sub_questions)
  if (subs.length) clean.sub_questions = subs

  if (isObj(q.reference_solution)) {
    const code = str(q.reference_solution.code, 20000)
    const language = str(q.reference_solution.language, 40).trim()
    if (code.trim() && language) clean.reference_solution = { language, code }
  }
  const runs = Math.round(num(q.black_box_runs, 0, BLACK_BOX_MAX_RUNS, 0))
  if (runs > 0) clean.black_box_runs = runs

  if (isObj(q.upload)) {
    const ids = new Set(UPLOAD_FILE_KINDS.map((k) => k.id))
    const allowed = Array.isArray(q.upload.allowed) ? q.upload.allowed.map((x) => str(x, 20)).filter((x) => ids.has(x)) : []
    clean.upload = { allowed: allowed.length ? [...new Set(allowed)] : ['pdf'], max_mb: num(q.upload.max_mb, 1, ANSWER_FILE_MAX_MB, 5) }
  }
  if (isObj(q.video)) {
    clean.video = {
      max_seconds: Math.round(num(q.video.max_seconds, 10, VIDEO_MAX_SECONDS, 120)),
      retakes: Math.round(num(q.video.retakes, 0, 5, 1)),
      allow_text_alternative: q.video.allow_text_alternative !== false,
    }
  }
  if (isObj(q.typing)) {
    const passage = str(q.typing.passage, MAX_PASSAGE)
    if (passage.trim()) {
      const limit = Math.round(num(q.typing.time_limit_seconds, 0, 900, 0))
      clean.typing = {
        passage,
        min_wpm: Math.round(num(q.typing.min_wpm, 1, 250, 35)),
        min_accuracy: num(q.typing.min_accuracy, 1, 100, 90),
        ...(limit > 0 ? { time_limit_seconds: limit } : {}),
      }
    }
  }
}

/** Only the wave-6 fields of a stored question (bank ↔ exam copies). */
export function extendedFieldsOf(q: Record<string, unknown>): ExtendedQuestionFields {
  const out: Record<string, unknown> = {}
  sanitizeExtendedQuestionFields(q, out)
  return out as ExtendedQuestionFields
}

// ─── Candidate projection ────────────────────────────────────────────────────

/** Add what a candidate needs for the wave-6 types; keys and rubrics stay out. */
export function candidateExtendedFields(q: Record<string, unknown>, out: Record<string, unknown>): void {
  const ext = extendedFieldsOf(q)
  if (ext.aptitude_area) out.aptitude_area = ext.aptitude_area
  if (ext.allow_diagram) out.allow_diagram = true
  if (ext.sub_questions) {
    out.sub_questions = ext.sub_questions.map((s) => ({ id: s.id, type: s.type, prompt: s.prompt, points: s.points, ...(s.options ? { options: s.options } : {}) }))
  }
  if (ext.black_box_runs && ext.reference_solution) out.black_box_runs = ext.black_box_runs
  if (ext.upload) out.upload = ext.upload
  if (ext.video) out.video = ext.video
  if (ext.typing) out.typing = ext.typing
}

// ─── Answer envelopes ────────────────────────────────────────────────────────

/** Parse a JSON-object answer; {} when it is not one. */
export function parseJsonAnswer(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const v = JSON.parse(raw)
    return isObj(v) ? v : {}
  } catch {
    return {}
  }
}

/** Types answered through the extended answer component. */
export const EXTENDED_INPUT_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>(['system_design', 'case_study', 'video_response', 'file_upload', 'typing_test'])

/** A readable one-line summary of an answer (results tables, exports). */
export function describeExtendedAnswer(type: string, raw: string): string | null {
  const t = canonicalType(type)
  if (!EXTENDED_INPUT_TYPES.has(t)) return null
  const a = parseJsonAnswer(raw)
  if (t === 'system_design') return str(a.text, 200) || (raw && !raw.trim().startsWith('{') ? raw.slice(0, 200) : '')
  if (t === 'typing_test') return `${typeof a.typed === 'string' ? a.typed.length : 0} characters typed`
  if (t === 'case_study') return `${Object.keys(a).length} part(s) answered`
  if (t === 'video_response') return a.file_id ? `Recording (${Math.round(Number(a.duration_s) || 0)} s)` : str(a.text_alternative, 200)
  return a.file_id ? str(a.name, 200) : ''
}

// ─── Aptitude sections ───────────────────────────────────────────────────────

/**
 * Build one timed section per aptitude area that has questions (Quant →
 * Logical → Verbal), each `minutes` long. Questions without an area go to a
 * final untimed section only when `keepOthers` (else they fall to the last
 * section, as resolveSections does).
 */
export function aptitudeSections(
  questions: readonly { id: string; aptitude_area?: string }[],
  minutes: Partial<Record<AptitudeArea, number>> = {},
  keepOthers = true,
): ExamSection[] {
  const out: ExamSection[] = []
  for (const a of APTITUDE_AREAS) {
    const ids = questions.filter((q) => q.aptitude_area === a.id).map((q) => q.id)
    if (!ids.length) continue
    const m = Math.round(Number(minutes[a.id] ?? 20))
    out.push({ id: `apt_${a.id}`, title: a.label, time_limit_minutes: Number.isFinite(m) && m >= 1 ? m : 20, lock_after_leave: true, question_ids: ids })
  }
  const rest = questions.filter((q) => !APTITUDE_AREAS.some((a) => a.id === q.aptitude_area)).map((q) => q.id)
  if (keepOthers && rest.length && out.length) {
    out.push({ id: 'apt_other', title: 'Other questions', time_limit_minutes: null, lock_after_leave: false, question_ids: rest })
  }
  return out
}

/** Likert items can carry a psychometric trait key. */
export function supportsTrait(type: string): boolean {
  return canonicalType(type) === 'likert'
}

// ─── Builder defaults ────────────────────────────────────────────────────────

/** Every wave-6 field cleared — spread first when the author switches type. */
export const EXTENDED_FIELD_RESET: Record<keyof ExtendedQuestionFields, undefined> = {
  aptitude_area: undefined, trait: undefined, reverse_scored: undefined, rubric: undefined, allow_diagram: undefined,
  sub_questions: undefined, reference_solution: undefined, black_box_runs: undefined, upload: undefined, video: undefined, typing: undefined,
}

/** Seed fields for a newly picked wave-6 type ({} for the others). */
export function extendedDefaultsForType(type: string): ExtendedQuestionFields {
  switch (canonicalType(type)) {
    case 'system_design': return { allow_diagram: true, rubric: '' }
    case 'case_study': return { sub_questions: [{ id: 's1', type: 'mcq', prompt: '', options: ['', '', '', ''], points: 5 }] }
    case 'reverse_coding': return { reference_solution: { language: 'python', code: '' }, black_box_runs: 10 }
    case 'file_upload': return { upload: { allowed: ['pdf'], max_mb: 5 } }
    case 'video_response': return { video: { max_seconds: 120, retakes: 1, allow_text_alternative: true } }
    case 'typing_test': return { typing: { passage: '', min_wpm: 35, min_accuracy: 92 } }
    default: return {}
  }
}
