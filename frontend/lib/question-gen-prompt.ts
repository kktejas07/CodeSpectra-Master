/**
 * Shared authoring rules for the AI question generators (exam creation, the
 * question-bank generate route, and the 45k batch script). One place to teach
 * the LLM how to shape each question type — including the structured fields
 * (pairs/matrix/table/regions/scale/tolerance) the newer types need.
 */
import { canonicalType, type QuestionType } from '@/lib/question-types'

const TYPE_RULES: Record<QuestionType, string> = {
  mcq: "'mcq' = exactly 4 distinct options + one correct answer (answer = the correct option text).",
  multiple_response: "'multiple_response' = 4-5 options + ALL correct answers comma-separated in answer.",
  true_false: "'true_false' = options [\"True\",\"False\"] + answer \"True\" or \"False\".",
  yes_no: "'yes_no' = options [\"Yes\",\"No\"] + answer \"Yes\" or \"No\".",
  fill_blanks: "'fill_blanks' = the question contains ____ for each blank; answer is the blank value(s) comma-separated (options may list a word bank).",
  numeric: "'numeric' = answer is a number as a string; set tolerance to the accepted ± range (0 for exact).",
  short_answer: "'short_answer' = answer is the expected short text (matched case/space-insensitive); no options.",
  ordering: "'ordering' = options list the items IN THE CORRECT ORDER; answer duplicates options joined by \", \".",
  ranking: "'ranking' = options list the items ranked best-to-worst; answer duplicates options joined by \", \".",
  matching: "'matching' = set pairs:[{\"left\":..,\"right\":..}]; leave options and answer empty.",
  drag_drop: "'drag_drop' = labeling; set pairs:[{\"left\":target,\"right\":label}]; leave options and answer empty.",
  matrix: "'matrix' = set matrix:{\"rows\":[..],\"columns\":[..]}; answer is the correct column per row, comma-separated in row order.",
  table_fill: "'table_fill' = set table:{\"rows\":[..]}; answer is the correct value per row, comma-separated in row order.",
  hotspot: "'hotspot' = set image_url and regions:[{\"id\",\"x\",\"y\",\"w\",\"h\",\"label\"}] with percentages 0-100; answer is the correct region id.",
  likert: "'likert' = set scale:{\"min\":1,\"max\":5}; no correct answer (unscored survey item).",
  rating: "'rating' = set scale:{\"min\":1,\"max\":5}; no correct answer (unscored rating item).",
  coding: "'coding' = empty options; answer is a short approach outline (no full solution); include tech_stack (1-3 languages) and test_cases (2-4 {\"input\",\"output\"} objects).",
  debugging: "'debugging' = the question includes a BUGGY code snippet; answer states the root cause and the fix; include language and optional test_cases.",
  code_completion: "'code_completion' = the question includes code with a missing section; put the scaffold in starter_code; answer is the completed logic.",
  output_prediction: "'output_prediction' = the question includes code; answer is the EXACT expected output.",
  code_review: "'code_review' = the question includes a code snippet/PR; answer lists the concrete issues or bugs found.",
  sql: "'sql' = the question describes a schema and task; answer is the expected SQL query.",
  regex_config: "'regex_config' = answer is the expected regex / CLI command / config snippet.",
  refactoring: "'refactoring' = the question includes code to improve; answer describes the refactor / optimization.",
  test_case_writing: "'test_case_writing' = the question gives code or a spec; answer lists example test cases.",
  descriptive: "'descriptive' = empty options; answer is a model-answer paragraph or grading rubric.",
}

/** Comma-joined authoring rules for the requested types (unknown types ignored). */
export function buildTypeInstructions(types: readonly string[]): string {
  const seen = new Set<QuestionType>()
  const rules: string[] = []
  for (const raw of types) {
    const t = canonicalType(raw, 'mcq')
    if (seen.has(t)) continue
    seen.add(t)
    rules.push(TYPE_RULES[t])
  }
  return rules.join(' ')
}

/**
 * Extra JSON fields the model must populate for structured types in the current
 * request (so it emits pairs/matrix/table/regions/scale/tolerance when needed).
 */
export function buildExtraFieldHint(types: readonly string[]): string {
  const fields = new Set<string>()
  for (const raw of types) {
    switch (canonicalType(raw, 'mcq')) {
      case 'numeric': fields.add('"tolerance": number'); break
      case 'matching':
      case 'drag_drop': fields.add('"pairs": [{"left","right"}]'); break
      case 'matrix': fields.add('"matrix": {"rows":[string],"columns":[string]}'); break
      case 'table_fill': fields.add('"table": {"rows":[string]}'); break
      case 'hotspot': fields.add('"image_url": string, "regions": [{"id","x","y","w","h","label"}]'); break
      case 'likert':
      case 'rating': fields.add('"scale": {"min":number,"max":number}'); break
      case 'coding':
      case 'debugging':
      case 'code_completion':
      case 'output_prediction':
      case 'code_review':
      case 'sql':
      case 'regex_config':
      case 'refactoring':
      case 'test_case_writing': fields.add('"language": string, "starter_code": string (optional), "test_cases": [{"input","output"}] (optional)'); break
      default: break
    }
  }
  return fields.size ? ` Include these extra fields where relevant: ${[...fields].join('; ')}.` : ''
}
