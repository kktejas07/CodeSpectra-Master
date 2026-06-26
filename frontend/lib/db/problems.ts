/**
 * Problems + Submissions repository.
 *
 * Powers the HackerRank-style problem-solving UI:
 *   - problems         : problem catalog (statement, sample + hidden tests)
 *   - submissions      : per-user solution attempts (status, score, results)
 *   - problem_languages: optional per-problem boilerplate per language
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export function newId(): string {
  return randomUUID()
}
export function nowIso(): string {
  return new Date().toISOString()
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface TestCase {
  id: string
  stdin: string
  expected_stdout: string
  is_sample: boolean
  weight?: number
}

export interface ProblemDoc {
  id: string
  slug: string
  title: string
  difficulty: Difficulty
  topics: string[]
  statement_md: string
  input_format?: string | null
  output_format?: string | null
  constraints?: string | null
  example_explanation?: string | null
  test_cases: TestCase[]
  starter_code: Record<string, string> // { python: "def solve():...", javascript: "..." }
  time_limit_ms: number
  memory_limit_kb: number
  is_published: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

export type SubmissionStatus =
  | 'queued'
  | 'running'
  | 'accepted'
  | 'wrong_answer'
  | 'runtime_error'
  | 'compile_error'
  | 'time_limit'
  | 'error'

export interface TestRunResult {
  test_id: string
  passed: boolean
  is_sample: boolean
  stdout?: string
  stderr?: string
  expected?: string
  time_ms?: number
  error?: string
}

export interface SubmissionDoc {
  id: string
  problem_id: string
  user_id: string
  language: string
  language_version?: string | null
  source_code: string
  status: SubmissionStatus
  score: number // 0..100, % of test cases passed (weighted)
  total_tests: number
  passed_tests: number
  results: TestRunResult[]
  stderr_excerpt?: string | null
  total_time_ms?: number
  created_at: string
}

async function db() {
  return getMongoDb()
}

export async function problems(): Promise<Collection<ProblemDoc>> {
  return (await db()).collection<ProblemDoc>('problems')
}

export async function submissions(): Promise<Collection<SubmissionDoc>> {
  return (await db()).collection<SubmissionDoc>('submissions')
}
