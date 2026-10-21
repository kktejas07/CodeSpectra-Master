/**
 * Contest format registry (client-safe). Each format declares what people
 * submit, how entries rank, which events-feed kind it publishes as, and the
 * config fields the admin editor renders. Fields marked `secret` are split
 * off into `contest_secrets` on save and never sent to participants.
 *
 * Scoring lives in lib/contests/scoring/* (pure, tested); the server side of
 * each format is in lib/contests/participation.ts.
 */
import type { EventKind } from '@/lib/subscriptions/types'
import type { ContestFormat } from './types'

export type FieldType =
  | 'text' | 'textarea' | 'code' | 'number' | 'select' | 'boolean'
  /** One per line or comma separated. */
  | 'string_list'
  /** Test cases: [{ input, expected, sample }]. */
  | 'tests'
  /** Example I/O pairs shown to people: [{ input, output }]. */
  | 'examples'
  /** Plain text the server hashes (CTF flags). Never returned. */
  | 'flag'
  /** CSV text (datathon labels). */
  | 'csv'
  /** Eval cases: [{ input, expected, match }]. */
  | 'eval_cases'

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  help?: string
  secret?: boolean
  required?: boolean
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  maxLen?: number
  default?: unknown
}

export interface FileSlot {
  role: 'deck' | 'video' | 'diagram' | 'predictions'
  label: string
  /** Lower-case extensions without the dot. */
  exts: string[]
  required: boolean
  maxBytes: number
}

export type SubmissionKind = 'code' | 'flag' | 'csv' | 'prompt' | 'files' | 'pr_url'

export interface FormatMeta {
  id: ContestFormat
  label: string
  /** Sentence for the format picker and listing cards. */
  description: string
  feedKind: EventKind
  submission: SubmissionKind
  /** Judges score submissions with the rubric (no auto-score). */
  judged: boolean
  /** How an entry's total is built from its submissions. */
  aggregate: 'sum_best_per_task' | 'best' | 'sum_all'
  defaultMode: 'solo' | 'team'
  top: FieldSpec[]
  task: { label: string; plural: string; max: number; fields: FieldSpec[] } | null
  files?: FileSlot[]
  /** Participants can run code against the sample tests before submitting. */
  sampleRuns?: boolean
}

const MB = 1024 * 1024
const LANG_HELP = 'Languages allowed, e.g. python, javascript, java, cpp, go. Empty = python, javascript, java, cpp.'

const points: FieldSpec = { key: 'points', label: 'Points', type: 'number', min: 1, max: 10000, default: 100 }
const title: FieldSpec = { key: 'title', label: 'Title', type: 'text', required: true, maxLen: 120 }
const languages: FieldSpec = { key: 'languages', label: 'Languages', type: 'string_list', help: LANG_HELP }
const hiddenTests: FieldSpec = { key: 'tests', label: 'Tests', type: 'tests', secret: true, required: true, help: 'stdin and the exact expected stdout. Mark a few as samples: people see those; the rest stay hidden.' }

export const FORMATS: Record<ContestFormat, FormatMeta> = {
  theory_to_code: {
    id: 'theory_to_code', label: 'Theory-to-code sprint', feedKind: 'codeathon', submission: 'code', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'solo', sampleRuns: true,
    description: 'Read a short concept brief (an algorithm, a protocol, a formula) and implement it. Hidden tests decide the score.',
    top: [],
    task: { label: 'Concept', plural: 'Concepts', max: 20, fields: [title, { key: 'brief', label: 'Concept brief', type: 'textarea', required: true, maxLen: 8000 }, { key: 'io', label: 'Input and output format', type: 'textarea', maxLen: 2000 }, languages, points, hiddenTests] },
  },
  reverse_coding: {
    id: 'reverse_coding', label: 'Reverse coding', feedKind: 'codeathon', submission: 'code', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'solo', sampleRuns: true,
    description: 'A black box turns inputs into outputs. Work out the rule from examples (and by running the box), then write code that does the same.',
    top: [{ key: 'blackbox_runs_per_hour', label: 'Black-box runs per person per hour', type: 'number', min: 0, max: 200, default: 20, help: '0 turns the "run the black box" button off.' }],
    task: { label: 'Black box', plural: 'Black boxes', max: 20, fields: [title, { key: 'hint', label: 'Hint', type: 'textarea', maxLen: 2000 }, { key: 'examples', label: 'Example inputs and outputs', type: 'examples', help: 'Shown to everyone.' }, { key: 'reference_language', label: 'Reference language', type: 'text', secret: true, default: 'python' }, { key: 'reference_code', label: 'Reference solution (the black box)', type: 'code', secret: true, required: true, maxLen: 20000 }, languages, points, hiddenTests] },
  },
  debug_a_thon: {
    id: 'debug_a_thon', label: 'Debug-a-thon (bug bash)', feedKind: 'debugathon', submission: 'code', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'solo', sampleRuns: true,
    description: 'Start from seeded buggy code. Your score is the share of tests you turn green, minus a small time penalty.',
    top: [{ key: 'penalty_per_minute', label: 'Penalty per minute (points)', type: 'number', min: 0, max: 100, default: 0.2 }, { key: 'min_percent', label: 'Lowest score after penalty (% of earned points)', type: 'number', min: 0, max: 100, default: 30 }],
    task: { label: 'Buggy program', plural: 'Buggy programs', max: 20, fields: [title, { key: 'language', label: 'Language', type: 'text', required: true, default: 'python' }, { key: 'buggy_code', label: 'Buggy code', type: 'code', required: true, maxLen: 20000 }, { key: 'notes', label: 'What it should do', type: 'textarea', maxLen: 4000 }, points, hiddenTests] },
  },
  ctf: {
    id: 'ctf', label: 'Capture the flag', feedKind: 'ctf', submission: 'flag', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'team',
    description: 'Security puzzles hide flags. Submit a flag to solve a challenge; points drop as more teams solve it.',
    top: [{ key: 'attempts_per_minute', label: 'Flag attempts per entry per minute', type: 'number', min: 1, max: 60, default: 5 }, { key: 'flag_format', label: 'Flag format shown to people', type: 'text', default: 'flag{...}', maxLen: 60 }],
    task: { label: 'Challenge', plural: 'Challenges', max: 60, fields: [title, { key: 'category', label: 'Category', type: 'select', options: ['web', 'crypto', 'forensics', 'pwn', 'reversing', 'osint', 'misc'].map((v) => ({ value: v, label: v })), default: 'misc' }, { key: 'description', label: 'Description', type: 'textarea', required: true, maxLen: 8000 }, { key: 'attachment_url', label: 'Attachment link', type: 'text', maxLen: 500 }, { key: 'initial_points', label: 'Starting points', type: 'number', min: 10, max: 10000, default: 500 }, { key: 'min_points', label: 'Lowest points', type: 'number', min: 1, max: 10000, default: 100 }, { key: 'decay_solves', label: 'Solves until lowest points', type: 'number', min: 1, max: 10000, default: 20 }, { key: 'flag', label: 'Flag', type: 'flag', secret: true, required: true, help: 'Stored only as a salted hash. Leave blank to keep the current flag.' }] },
  },
  datathon: {
    id: 'datathon', label: 'Datathon', feedKind: 'datathon', submission: 'csv', judged: false, aggregate: 'best', defaultMode: 'team',
    description: 'Download the dataset, train a model and upload predictions. A public split ranks you live; a hidden private split decides the final board.',
    top: [
      { key: 'dataset_url', label: 'Dataset download link', type: 'text', required: true, maxLen: 500 },
      { key: 'metric', label: 'Metric', type: 'select', default: 'accuracy', options: [{ value: 'accuracy', label: 'Accuracy (higher is better)' }, { value: 'f1', label: 'F1 (higher is better)' }, { value: 'rmse', label: 'RMSE (lower is better)' }, { value: 'mae', label: 'MAE (lower is better)' }] },
      { key: 'id_column', label: 'Id column', type: 'text', default: 'id', maxLen: 60 },
      { key: 'target_column', label: 'Prediction column', type: 'text', default: 'target', maxLen: 60 },
      { key: 'positive_label', label: 'Positive label (F1)', type: 'text', default: '1', maxLen: 60 },
      { key: 'public_percent', label: 'Rows in the public split (%)', type: 'number', min: 5, max: 95, default: 30 },
      { key: 'submissions_per_day', label: 'Uploads per entry per day', type: 'number', min: 1, max: 100, default: 5 },
      { key: 'labels_csv', label: 'Hidden labels (CSV with the id and prediction columns)', type: 'csv', secret: true, required: true, maxLen: 3_000_000, help: 'Up to 50,000 rows. Leave blank to keep the current labels.' },
    ],
    task: null,
    files: [{ role: 'predictions', label: 'Predictions CSV', exts: ['csv'], required: true, maxBytes: 5 * MB }],
  },
  prompt_a_thon: {
    id: 'prompt_a_thon', label: 'Prompt-a-thon', feedKind: 'promptathon', submission: 'prompt', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'solo',
    description: 'Write a prompt. We run it on our model against a hidden set of inputs; your score is the share it gets right.',
    top: [
      { key: 'runs_per_user', label: 'Runs per person (whole contest)', type: 'number', min: 1, max: 200, default: 10 },
      { key: 'spend_cap_usd', label: 'Spend cap for this contest (USD)', type: 'number', min: 0, max: 500, default: 2 },
      { key: 'max_prompt_chars', label: 'Longest prompt (characters)', type: 'number', min: 50, max: 8000, default: 2000 },
    ],
    task: { label: 'Task', plural: 'Tasks', max: 10, fields: [title, { key: 'goal', label: 'What the prompt must do', type: 'textarea', required: true, maxLen: 4000 }, { key: 'examples', label: 'Example inputs and outputs', type: 'examples' }, points, { key: 'eval_cases', label: 'Hidden eval set', type: 'eval_cases', secret: true, required: true, help: 'Up to 25 cases. Match: exact, contains or regex.' }] },
  },
  ideathon: {
    id: 'ideathon', label: 'Ideathon / pitch', feedKind: 'ideathon', submission: 'files', judged: true, aggregate: 'best', defaultMode: 'team',
    description: 'Pitch an idea with a short deck and a video. Judges score it on the rubric.',
    top: [{ key: 'prompt', label: 'Challenge statement', type: 'textarea', required: true, maxLen: 6000 }, { key: 'video_required', label: 'Video required', type: 'boolean', default: true }],
    task: null,
    files: [
      { role: 'deck', label: 'Pitch deck (PDF or PPTX)', exts: ['pdf', 'pptx'], required: true, maxBytes: 9 * MB },
      { role: 'video', label: 'Short video (MP4)', exts: ['mp4'], required: false, maxBytes: 9 * MB },
    ],
  },
  code_golf: {
    id: 'code_golf', label: 'Code golf', feedKind: 'code_golf', submission: 'code', judged: false, aggregate: 'sum_best_per_task', defaultMode: 'solo', sampleRuns: true,
    description: 'Pass every test with the fewest characters. The shortest solution takes full points; longer ones get a share.',
    top: [],
    task: { label: 'Hole', plural: 'Holes', max: 20, fields: [title, { key: 'statement', label: 'Statement', type: 'textarea', required: true, maxLen: 6000 }, languages, points, hiddenTests] },
  },
  system_design_jam: {
    id: 'system_design_jam', label: 'System design jam', feedKind: 'design_jam', submission: 'files', judged: true, aggregate: 'best', defaultMode: 'team',
    description: 'Design a system for a brief: write up the architecture and add a diagram. Judges score it on the rubric.',
    top: [{ key: 'brief', label: 'Design brief', type: 'textarea', required: true, maxLen: 8000 }, { key: 'max_words', label: 'Word limit for the write-up', type: 'number', min: 100, max: 10000, default: 2000 }],
    task: null,
    files: [{ role: 'diagram', label: 'Diagram (PNG, JPEG or PDF)', exts: ['png', 'jpg', 'jpeg', 'pdf'], required: false, maxBytes: 9 * MB }],
  },
  open_source_sprint: {
    id: 'open_source_sprint', label: 'Open-source sprint', feedKind: 'open_source', submission: 'pr_url', judged: false, aggregate: 'sum_all', defaultMode: 'solo',
    description: 'Contribute to registered open-source repositories. Every merged pull request during the sprint earns points.',
    top: [{ key: 'points_per_pr', label: 'Points per merged pull request', type: 'number', min: 1, max: 1000, default: 10 }, { key: 'max_prs_per_entry', label: 'Most pull requests counted per entry', type: 'number', min: 1, max: 200, default: 20 }],
    task: { label: 'Repository', plural: 'Repositories', max: 50, fields: [{ key: 'url', label: 'GitHub repository URL', type: 'text', required: true, maxLen: 300 }, { key: 'title', label: 'Display name', type: 'text', maxLen: 120 }, { key: 'note', label: 'Good first issues / notes', type: 'textarea', maxLen: 2000 }] },
  },
}

export const FORMAT_LIST: FormatMeta[] = Object.values(FORMATS)

export function formatMeta(id: ContestFormat): FormatMeta {
  return FORMATS[id]
}

/** Ranking direction (datathon RMSE / MAE: lower is better). */
export function rankDirection(format: ContestFormat, config: Record<string, unknown>): 'desc' | 'asc' {
  if (format === 'datathon' && (config.metric === 'rmse' || config.metric === 'mae')) return 'asc'
  return 'desc'
}

/** Languages a code task allows. */
export function taskLanguages(task: Record<string, unknown>): string[] {
  const list = Array.isArray(task.languages) ? task.languages.filter((x): x is string => typeof x === 'string' && !!x) : []
  if (typeof task.language === 'string' && task.language) return [task.language]
  return list.length ? list : ['python', 'javascript', 'java', 'cpp']
}
