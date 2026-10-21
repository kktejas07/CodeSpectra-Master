/**
 * Canonical question-type registry — the single source of truth for the type
 * ids, display labels, grouping, and grading kind used across the whole
 * assessment pipeline (exam API, submit grader, AI grader, runner UI, admin
 * builder, and question bank).
 *
 * Pure constants only (no server / Mongo / React deps) so both client pages and
 * server routes can import it safely. Every other module that used to hard-code
 * its own type list should import from here (see BANK_QUESTION_TYPES re-exports
 * in lib/engineering-catalog.ts and lib/question-bank.ts).
 */

export type QuestionGroup = 'objective' | 'coding' | 'written'

/** How the submit grader decides correctness. */
export type GradingKind =
  | 'choice' // single-select from a list (mcq, true_false, yes_no, hotspot)
  | 'multi' // multi-select set (multiple_response)
  | 'blanks' // comma list of blanks, partial credit (fill_blanks)
  | 'numeric' // number with tolerance (numeric)
  | 'text' // normalized string equality (short_answer)
  | 'sequence' // ordered list (ordering, ranking)
  | 'pairs' // left→right mapping (matching, drag_drop)
  | 'matrix' // one column choice per row (matrix)
  | 'table' // one answer per row cell (table_fill)
  | 'exec' // code execution / LLM review (coding + variants)
  | 'llm' // free-text LLM / manual (descriptive)
  | 'unscored' // attitudinal, no right answer (likert, rating)
  | 'composite' // linked objective sub-questions, score = sum (case_study)
  | 'typing' // WPM + accuracy against author thresholds (typing_test)
  | 'upload' // a file / recording a person marks (file_upload, video_response)

export type QuestionType =
  // objective / auto-graded
  | 'mcq'
  | 'multiple_response'
  | 'true_false'
  | 'yes_no'
  | 'fill_blanks'
  | 'numeric'
  | 'short_answer'
  | 'matching'
  | 'ordering'
  | 'ranking'
  | 'matrix'
  | 'table_fill'
  | 'hotspot'
  | 'drag_drop'
  | 'likert'
  | 'rating'
  // coding + variants
  | 'coding'
  | 'debugging'
  | 'code_completion'
  | 'output_prediction'
  | 'code_review'
  | 'sql'
  | 'regex_config'
  | 'refactoring'
  | 'test_case_writing'
  | 'theory_to_code'
  | 'reverse_coding'
  // written / subjective
  | 'descriptive'
  | 'system_design'
  // wave 6: composite / media / skills
  | 'case_study'
  | 'video_response'
  | 'file_upload'
  | 'typing_test'

export interface QuestionTypeMeta {
  label: string
  /** Compact label for chips/tables. */
  short: string
  group: QuestionGroup
  kind: GradingKind
  /** Deterministic (no LLM) grading in the submit route. */
  deterministic: boolean
  /** Contributes to max score / is gradable at all. */
  scored: boolean
  /** Builder shows an editable options / item list. */
  hasOptions: boolean
  description: string
  /**
   * Marked without a person when true (objective keys, hidden tests, typing
   * thresholds). Absent = derived: deterministic or code-execution types.
   */
  autoGraded?: boolean
  /** Hidden test cases decide the score (Piston), like `coding`. */
  hiddenTests?: boolean
  /** Always ends with a human check, even after an AI suggestion. */
  humanReview?: boolean
}

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  // ── Objective ──
  mcq: { label: 'Multiple Choice', short: 'MCQ', group: 'objective', kind: 'choice', deterministic: true, scored: true, hasOptions: true, description: 'One correct option out of several.' },
  multiple_response: { label: 'Multiple Response', short: 'Multi-select', group: 'objective', kind: 'multi', deterministic: true, scored: true, hasOptions: true, description: 'Select all that apply — order-insensitive set match.' },
  true_false: { label: 'True / False', short: 'T/F', group: 'objective', kind: 'choice', deterministic: true, scored: true, hasOptions: true, description: 'Binary statement, options True/False.' },
  yes_no: { label: 'Yes / No', short: 'Y/N', group: 'objective', kind: 'choice', deterministic: true, scored: true, hasOptions: true, description: 'Binary question, options Yes/No.' },
  fill_blanks: { label: 'Fill in the Blanks', short: 'Blanks', group: 'objective', kind: 'blanks', deterministic: true, scored: true, hasOptions: true, description: 'Use ___ in the prompt; comma-separated answers, partial credit.' },
  numeric: { label: 'Numeric Answer', short: 'Numeric', group: 'objective', kind: 'numeric', deterministic: true, scored: true, hasOptions: false, description: 'A number, optionally with an accepted tolerance.' },
  short_answer: { label: 'Short Answer', short: 'Short', group: 'objective', kind: 'text', deterministic: true, scored: true, hasOptions: false, description: 'Short free text with a normalized exact-match key.' },
  matching: { label: 'Matching / Pairing', short: 'Matching', group: 'objective', kind: 'pairs', deterministic: true, scored: true, hasOptions: false, description: 'Match each left item to its correct right item.' },
  ordering: { label: 'Ordering / Sequencing', short: 'Order', group: 'objective', kind: 'sequence', deterministic: true, scored: true, hasOptions: true, description: 'Put the items in the correct order.' },
  ranking: { label: 'Ranking / Preference', short: 'Ranking', group: 'objective', kind: 'sequence', deterministic: true, scored: true, hasOptions: true, description: 'Rank items in order of preference / priority.' },
  matrix: { label: 'Matrix / Multiple True-False', short: 'Matrix', group: 'objective', kind: 'matrix', deterministic: true, scored: true, hasOptions: false, description: 'One column choice per row (e.g. each row true/false).' },
  table_fill: { label: 'Table / Grid Fill', short: 'Table', group: 'objective', kind: 'table', deterministic: true, scored: true, hasOptions: true, description: 'Fill a value for each row of a table.' },
  hotspot: { label: 'Hotspot / Image Click', short: 'Hotspot', group: 'objective', kind: 'choice', deterministic: true, scored: true, hasOptions: false, description: 'Click the correct region on an image.' },
  drag_drop: { label: 'Drag & Drop / Labeling', short: 'Labeling', group: 'objective', kind: 'pairs', deterministic: true, scored: true, hasOptions: false, description: 'Assign each label to its correct target.' },
  likert: { label: 'Likert Scale', short: 'Likert', group: 'objective', kind: 'unscored', deterministic: false, scored: false, hasOptions: false, description: 'Attitudinal agree/disagree scale — not scored.' },
  rating: { label: 'Rating Scale', short: 'Rating', group: 'objective', kind: 'unscored', deterministic: false, scored: false, hasOptions: false, description: 'Numeric/star rating — not scored.' },
  // ── Coding + variants ──
  coding: { label: 'Coding Challenge', short: 'Coding', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Write code; scored by hidden test cases (Piston) then LLM review.' },
  debugging: { label: 'Code Debugging', short: 'Debug', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Fix a broken snippet; scored by tests / LLM review.' },
  code_completion: { label: 'Code Completion', short: 'Complete', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Fill in the missing lines of code.' },
  output_prediction: { label: 'Output Prediction', short: 'Predict', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'State what the given code prints.' },
  code_review: { label: 'Code Review / Find the Bug', short: 'Review', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Review a snippet and identify issues.' },
  sql: { label: 'SQL Query Writing', short: 'SQL', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Write a SQL query for a given schema.' },
  regex_config: { label: 'Regex / CLI / Config', short: 'Regex/CLI', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Write a regex, CLI command, or config snippet.' },
  refactoring: { label: 'Refactoring / Optimization', short: 'Refactor', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Improve structure / performance of existing code.' },
  test_case_writing: { label: 'Test-Case Writing', short: 'Tests', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, description: 'Write test cases for given code / a spec.' },
  // ── Written ──
  descriptive: { label: 'Descriptive / Essay', short: 'Written', group: 'written', kind: 'llm', deterministic: false, scored: true, hasOptions: false, description: 'Long-form written response, essay, case study, or design prompt.' },
  // ── Wave 6 ──
  theory_to_code: { label: 'Theory to code', short: 'Theory→code', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, autoGraded: true, hiddenTests: true, description: 'Read a concept, algorithm or paper summary, then implement it; scored by hidden tests.' },
  reverse_coding: { label: 'Reverse coding (black box)', short: 'Reverse', group: 'coding', kind: 'exec', deterministic: false, scored: true, hasOptions: false, autoGraded: true, hiddenTests: true, description: 'Only input→output samples are shown (plus an optional black-box runner); write code that behaves the same.' },
  system_design: { label: 'System design', short: 'Design', group: 'written', kind: 'llm', deterministic: false, scored: true, hasOptions: false, autoGraded: false, humanReview: true, description: 'Written design plus an optional text/mermaid diagram; AI-marked against your rubric, then checked by a person.' },
  case_study: { label: 'Case study', short: 'Case', group: 'objective', kind: 'composite', deterministic: false, scored: true, hasOptions: false, autoGraded: true, description: 'One scenario with linked objective / short-answer sub-questions; score is the sum of the parts.' },
  video_response: { label: 'Video response', short: 'Video', group: 'written', kind: 'upload', deterministic: false, scored: true, hasOptions: false, autoGraded: false, humanReview: true, description: 'Candidate records a short video answer in the browser; marked by a person.' },
  file_upload: { label: 'File upload', short: 'File', group: 'written', kind: 'upload', deterministic: false, scored: true, hasOptions: false, autoGraded: false, humanReview: true, description: 'Candidate uploads a file of the types you allow; marked by a person.' },
  typing_test: { label: 'Typing test', short: 'Typing', group: 'objective', kind: 'typing', deterministic: false, scored: true, hasOptions: false, autoGraded: true, description: 'Type a passage; marked on words per minute and accuracy against your thresholds.' },
}

/** Ordered list for builders / pickers. */
export const QUESTION_TYPES: { id: QuestionType; label: string; group: QuestionGroup; kind: GradingKind; description: string }[] =
  (Object.keys(QUESTION_TYPE_META) as QuestionType[]).map((id) => ({
    id,
    label: QUESTION_TYPE_META[id].label,
    group: QUESTION_TYPE_META[id].group,
    kind: QUESTION_TYPE_META[id].kind,
    description: QUESTION_TYPE_META[id].description,
  }))

/** All types a question bank / exam may hold. */
export const BANK_QUESTION_TYPES: QuestionType[] = Object.keys(QUESTION_TYPE_META) as QuestionType[]

/**
 * Aliases → canonical id. Keys are already normalized (lowercase, alphanumerics
 * only) so the lookup can strip the raw value the same way. Legacy/plural forms
 * from older imports and LLM output live here.
 */
const TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: 'mcq', multiplechoice: 'mcq', singlechoice: 'mcq', singleanswer: 'mcq',
  multipleresponse: 'multiple_response', multiselect: 'multiple_response', multi_response: 'multiple_response',
  multiresponse: 'multiple_response', multipleresponses: 'multiple_response', selectall: 'multiple_response',
  truefalse: 'true_false', boolean: 'true_false', tf: 'true_false',
  yesno: 'yes_no', yesorno: 'yes_no',
  fillblanks: 'fill_blanks', fillintheblanks: 'fill_blanks', fillblank: 'fill_blanks', fillinblanks: 'fill_blanks', blanks: 'fill_blanks',
  numeric: 'numeric', numericresponse: 'numeric', number: 'numeric', integer: 'numeric', float: 'numeric', decimal: 'numeric', calculation: 'numeric',
  shortanswer: 'short_answer', shortanswertext: 'short_answer', shorttext: 'short_answer',
  matching: 'matching', match: 'matching', pairing: 'matching', pairs: 'matching', pair: 'matching', matchthefollowing: 'matching',
  ordering: 'ordering', sequence: 'ordering', sequencing: 'ordering', order: 'ordering', sequenceorder: 'ordering',
  ranking: 'ranking', rank: 'ranking', preference: 'ranking', preferenceranking: 'ranking',
  matrix: 'matrix', multitruefalse: 'matrix', multipletruefalse: 'matrix', matrixmultipletruefalse: 'matrix', multiplechoicegrid: 'matrix',
  tablefill: 'table_fill', grid: 'table_fill', gridfill: 'table_fill', tablegridfill: 'table_fill', filltable: 'table_fill',
  hotspot: 'hotspot', imageclick: 'hotspot', clickimage: 'hotspot', imagespot: 'hotspot', imageselection: 'hotspot',
  dragdrop: 'drag_drop', labeling: 'drag_drop', labelling: 'drag_drop', labelmatching: 'drag_drop', draganddrop: 'drag_drop', imagepair: 'drag_drop',
  likert: 'likert', likertscale: 'likert',
  rating: 'rating', ratingscale: 'rating', stars: 'rating', starscale: 'rating',
  coding: 'coding', code: 'coding', program: 'coding', programming: 'coding', codesubmission: 'coding', codingchallenge: 'coding',
  debugging: 'debugging', debug: 'debugging', codedebugging: 'debugging', fixbug: 'debugging', bugfix: 'debugging', codefix: 'debugging', debugcode: 'debugging',
  codecompletion: 'code_completion', completion: 'code_completion', fillcode: 'code_completion', completecode: 'code_completion',
  outputprediction: 'output_prediction', predictoutput: 'output_prediction', whatprints: 'output_prediction', predicttheoutput: 'output_prediction', codeoutput: 'output_prediction',
  codereview: 'code_review', review: 'code_review', prreview: 'code_review', findbug: 'code_review', bugreview: 'code_review',
  sql: 'sql', sqlquery: 'sql', databasequery: 'sql', dbquery: 'sql', sqlwriting: 'sql',
  regexconfig: 'regex_config', regex: 'regex_config', cli: 'regex_config', config: 'regex_config', configuration: 'regex_config', terminal: 'regex_config', shellcommand: 'regex_config',
  refactoring: 'refactoring', refactor: 'refactoring', optimization: 'refactoring', optimisation: 'refactoring', optimize: 'refactoring', optimise: 'refactoring',
  testcasewriting: 'test_case_writing', testcase: 'test_case_writing', testcases: 'test_case_writing', testcasewrite: 'test_case_writing', writetestcases: 'test_case_writing',
  descriptive: 'descriptive', essay: 'descriptive', longanswer: 'descriptive', freetext: 'descriptive', written: 'descriptive', writtenresponse: 'descriptive', design: 'descriptive', shortessay: 'descriptive',
  theorytocode: 'theory_to_code', implementalgorithm: 'theory_to_code', papertocode: 'theory_to_code', implementation: 'theory_to_code',
  reversecoding: 'reverse_coding', blackbox: 'reverse_coding', reverseengineering: 'reverse_coding', blackboxcoding: 'reverse_coding',
  systemdesign: 'system_design', architecture: 'system_design', designinterview: 'system_design',
  casestudy: 'case_study', scenario: 'case_study', caselet: 'case_study',
  videoresponse: 'video_response', video: 'video_response', videoanswer: 'video_response', recordvideo: 'video_response',
  fileupload: 'file_upload', upload: 'file_upload', fileanswer: 'file_upload', attachment: 'file_upload',
  typingtest: 'typing_test', typing: 'typing_test', typingspeed: 'typing_test', wpm: 'typing_test',
}

/** Normalize a raw type string to the alias-lookup form. */
function aliasKey(raw: unknown): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Resolve any raw value to a canonical QuestionType, or null when unknown. */
export function resolveQuestionType(raw: unknown): QuestionType | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const key = aliasKey(raw)
  return TYPE_ALIASES[key] || (QUESTION_TYPE_META[raw as QuestionType] ? (raw as QuestionType) : null)
}

export function isQuestionType(raw: unknown): raw is QuestionType {
  return resolveQuestionType(raw) !== null
}

/** Resolve with a fallback (defaults to 'mcq', matching legacy behaviour). */
export function canonicalType(raw: unknown, fallback: QuestionType = 'mcq'): QuestionType {
  return resolveQuestionType(raw) ?? fallback
}

export function metaFor(raw: unknown): QuestionTypeMeta {
  return QUESTION_TYPE_META[canonicalType(raw)]
}

export function isCodingType(raw: unknown): boolean {
  return metaFor(raw).group === 'coding'
}

export function isWrittenType(raw: unknown): boolean {
  return metaFor(raw).group === 'written'
}

export function isDeterministicType(raw: unknown): boolean {
  return metaFor(raw).deterministic
}

export function isScoredType(raw: unknown): boolean {
  return metaFor(raw).scored
}

/** Marked without a person (objective keys, hidden tests, typing thresholds). */
export function isAutoGradedType(raw: unknown): boolean {
  const m = metaFor(raw)
  return m.autoGraded ?? (m.deterministic || m.kind === 'exec')
}

/** Hidden test cases decide the score (coding, theory_to_code, reverse_coding). */
export function runsHiddenTests(raw: unknown): boolean {
  const t = canonicalType(raw)
  return t === 'coding' || QUESTION_TYPE_META[t].hiddenTests === true
}

/** Always finishes with a person's check (system design, uploads, video). */
export function needsHumanReview(raw: unknown): boolean {
  return metaFor(raw).humanReview === true
}
