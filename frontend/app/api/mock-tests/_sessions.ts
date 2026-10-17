/**
 * Mock-test session storage shared by /api/mock-tests/generate and /attempts.
 *
 * Idempotency: an in-progress attempt carries `in_progress_key`
 * (user|company|role|difficulty) under a unique sparse index, so there is at
 * most one in-progress attempt per test per user. Reloading the take page
 * returns that attempt instead of generating (and charging for) a new one.
 * The key is removed when the attempt is submitted or abandoned via
 * "Start a new test" (`new_attempt: true`).
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { MOCK_TEST_SESSIONS } from '@/lib/mock-tests'

export interface StoredQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface MockTestSessionDoc {
  id: string
  user_id: string
  company: string
  role: string
  difficulty: string
  questions: StoredQuestion[]
  /** 'generating' while the AI call runs; 'ready' once questions are stored. */
  state?: 'generating' | 'ready'
  in_progress_key?: string
  created_at: string
  submitted_at: string | null
  abandoned_at?: string
  answers?: Record<string, number>
  score?: number
  total?: number
  percentage?: number
}

/** In-progress attempts older than this are abandoned, not resumed. */
export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000
/** A 'generating' placeholder older than this is a crashed request. */
export const GENERATING_STALE_MS = 3 * 60 * 1000

export function inProgressKey(userId: string, company: string, role: string, difficulty: string): string {
  const n = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return [userId, n(company), n(role), n(difficulty)].join('|')
}

let ensured: Promise<void> | null = null

export async function mockTestSessions(): Promise<Collection<MockTestSessionDoc>> {
  const col = (await getMongoDb()).collection<MockTestSessionDoc>(MOCK_TEST_SESSIONS)
  if (!ensured) {
    ensured = (async () => {
      try {
        await col.createIndex(
          { in_progress_key: 1 },
          { unique: true, sparse: true, name: 'mock_test_sessions_in_progress_unique' },
        )
        await col.createIndex({ id: 1 }, { name: 'mock_test_sessions_id' })
      } catch (e) {
        console.error('[mock-tests] could not ensure indexes:', e)
      }
    })()
  }
  await ensured
  return col
}

/** Questions as the candidate sees them — never the answer key. */
export function publicQuestions(questions: StoredQuestion[]) {
  return questions.map((q) => ({ id: q.id, question: q.question, options: q.options }))
}
