/**
 * SEO-039: a published demo assessment with one question of every type, so the
 * accessibility e2e (e2e/a11y-candidate.spec.ts) opens the real test screen.
 * Pure data — seeded by scripts/seed-a11y-assessment.ts, checked in
 * tests/seo-audit6-fixes.test.ts (every type present, survives the write-path
 * sanitizer).
 */
import { QUESTION_TYPE_META, type QuestionType } from '@/lib/question-types'

export const A11Y_EXAM_ID = 'a11y-all-question-types'

const HOTSPOT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#eef2ff"/><rect x="20" y="40" width="80" height="60" fill="#2F5BE7"/><rect x="200" y="40" width="80" height="60" fill="#94a3b8"/></svg>')

const code = { language: 'python', starter_code: 'def solve(n):\n    return n\n', test_cases: [{ input: '2', output: '4', hidden: true }] }

/** Per-type fields on top of { id, type, title, prompt, score }. */
const EXTRA: Record<QuestionType, Record<string, unknown>> = {
  mcq: { options: ['A queue', 'A stack', 'A heap', 'A graph'], answer: 'A stack' },
  multiple_response: { options: ['HTTP', 'TCP', 'Banana', 'UDP'], answer: 'HTTP,TCP,UDP' },
  true_false: { options: ['True', 'False'], answer: 'True' },
  yes_no: { options: ['Yes', 'No'], answer: 'Yes' },
  fill_blanks: { prompt: 'A ___ stores key-value pairs.', answer: 'map' },
  numeric: { answer: '42', tolerance: 0.5 },
  short_answer: { answer: 'git' },
  matching: { pairs: [{ left: 'GET', right: 'Read' }, { left: 'POST', right: 'Create' }, { left: 'DELETE', right: 'Remove' }] },
  ordering: { options: ['Plan', 'Build', 'Test', 'Ship'], answer: 'Plan,Build,Test,Ship' },
  ranking: { options: ['Correctness', 'Speed', 'Style'] },
  matrix: { matrix: { rows: ['Python is typed dynamically', 'C has garbage collection'], columns: ['True', 'False'] }, answer: 'True,False' },
  table_fill: { table: { columns: ['Value'], rows: ['2 + 2', '3 × 3'] }, answer: '4,9' },
  hotspot: { image_url: HOTSPOT_SVG, regions: [{ id: 'left', x: 20, y: 40, w: 80, h: 60, label: 'Blue box' }, { id: 'right', x: 200, y: 40, w: 80, h: 60, label: 'Grey box' }], answer: 'left' },
  drag_drop: { pairs: [{ left: 'HTML', right: 'Structure' }, { left: 'CSS', right: 'Style' }] },
  likert: { scale: { min: 1, max: 5, minLabel: 'Strongly disagree', maxLabel: 'Strongly agree' }, trait: 'teamwork' },
  rating: { scale: { min: 1, max: 5 } },
  coding: code,
  debugging: { ...code, starter_code: 'def solve(n):\n    return n +\n' },
  code_completion: code,
  output_prediction: { language: 'python', starter_code: 'print(2 ** 3)', answer: '8' },
  code_review: code,
  sql: { language: 'sql', starter_code: 'SELECT name FROM users;' },
  regex_config: { answer: '^\\d+$' },
  refactoring: code,
  test_case_writing: code,
  theory_to_code: code,
  reverse_coding: { ...code, reference_solution: { language: 'python', code: 'def solve(n):\n    return n * 2\n' }, black_box_runs: 3 },
  descriptive: { rubric: 'Clear, correct, concise.' },
  system_design: { rubric: 'Covers storage, scaling and failure modes.', allow_diagram: true },
  case_study: { prompt: 'A team ships weekly and sees rising bug counts.', sub_questions: [{ id: 's1', type: 'mcq', prompt: 'First step?', options: ['Add tests', 'Ship faster'], answer: 'Add tests', points: 5 }, { id: 's2', type: 'short_answer', prompt: 'Name one metric to track.', answer: 'defects', points: 5 }] },
  video_response: { video: { max_seconds: 60, retakes: 1, allow_text_alternative: true } },
  file_upload: { upload: { allowed: ['pdf'], max_mb: 5 } },
  typing_test: { typing: { passage: 'The quick brown fox jumps over the lazy dog.', min_wpm: 20, min_accuracy: 80 } },
}

export function a11yQuestionList(): Record<string, unknown>[] {
  return (Object.keys(QUESTION_TYPE_META) as QuestionType[]).map((type, i) => ({
    id: `a11y-${type}`,
    type,
    title: QUESTION_TYPE_META[type].label,
    prompt: `${QUESTION_TYPE_META[type].description} (sample ${i + 1})`,
    score: 5,
    ...EXTRA[type],
  }))
}
