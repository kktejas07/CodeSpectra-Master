/**
 * Problems + code-execution client (shapes mirror the web API responses).
 * All fields optional-chained at render — the server omits heavy fields
 * (statement, test cases) from list responses.
 */
import { api } from './client'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface ProblemSummary {
  id: string
  slug: string
  title: string
  difficulty: Difficulty
  topics?: string[]
  acceptance_rate?: number | null
}

export interface SampleCase {
  input: string
  output: string
  explanation?: string
}

export interface ProblemDetail extends ProblemSummary {
  statement_md?: string
  input_format?: string
  output_format?: string
  constraints?: string
  test_cases?: SampleCase[]
  hidden_test_count?: number
  starter_code?: Record<string, string> | string
}

export interface RunResult {
  stdout?: string
  stderr?: string
  exit_code?: number
  status?: string
  time_ms?: number
  [k: string]: unknown
}

export const LANGUAGES = ['python', 'javascript', 'java', 'cpp', 'go'] as const
export type Language = (typeof LANGUAGES)[number]

export async function listProblems(q?: string, difficulty?: Difficulty): Promise<ProblemSummary[]> {
  const params = new URLSearchParams({ limit: '50' })
  if (q?.trim()) params.set('q', q.trim())
  if (difficulty) params.set('difficulty', difficulty)
  const res = await api.get<{ data?: ProblemSummary[] }>(`/api/problems?${params.toString()}`)
  return Array.isArray(res.data) ? res.data : []
}

export async function getProblem(slug: string): Promise<ProblemDetail> {
  return api.get<ProblemDetail>(`/api/problems/${encodeURIComponent(slug)}`)
}

export async function runCode(language: string, source: string, stdin = ''): Promise<RunResult> {
  const res = await api.post<{ success: boolean; result?: RunResult; error?: string }>(
    '/api/execute-code',
    { language: language.toLowerCase(), source, stdin },
  )
  if (!res.success) throw new Error(res.error || 'Execution failed.')
  return res.result ?? {}
}

export function starterFor(detail: ProblemDetail, language: string): string {
  const sc = detail.starter_code
  if (!sc) return ''
  if (typeof sc === 'string') return sc
  return sc[language] ?? sc[language.toLowerCase()] ?? ''
}
