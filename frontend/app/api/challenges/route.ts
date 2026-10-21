import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

interface ChallengeDoc {
  id: string
  title: string
  type: string
  difficulty: string
  duration_minutes: number
  success_rate: number
  description: string
  starter_code?: string | null
  tenant_id?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

const SEED_CHALLENGES: Omit<ChallengeDoc, 'created_at' | 'updated_at'>[] = [
  { id: 'ch_tech_1', title: 'Explain HashMap Internals', type: 'technical', difficulty: 'easy', duration_minutes: 10, success_rate: 85, description: 'Explain how a HashMap works internally. Cover hashing, collision resolution, and resizing. Discuss time complexity of get and put operations.' },
  { id: 'ch_tech_2', title: 'Promise.all vs Promise.allSettled', type: 'technical', difficulty: 'easy', duration_minutes: 10, success_rate: 80, description: 'Explain the differences between Promise.all and Promise.allSettled. When would you use one over the other? Provide code examples.' },
  { id: 'ch_tech_3', title: 'HTTP Caching Strategies', type: 'technical', difficulty: 'medium', duration_minutes: 15, success_rate: 65, description: 'Compare ETag, Cache-Control, If-None-Match, and If-Modified-Since headers. Explain when to use each caching strategy in a REST API.' },
  { id: 'ch_tech_4', title: 'REST vs GraphQL Trade-offs', type: 'technical', difficulty: 'medium', duration_minutes: 15, success_rate: 60, description: 'Compare REST and GraphQL APIs. Discuss when GraphQL excels (nested data, mobile), when REST is better (caching, simplicity), and the N+1 problem.' },
  { id: 'ch_tech_5', title: 'Database Indexing Deep Dive', type: 'technical', difficulty: 'hard', duration_minutes: 20, success_rate: 45, description: 'Explain B-tree indexes, compound indexes, and covering indexes. Show how to analyze a query plan and identify missing indexes. Discuss index selectivity.' },
  { id: 'ch_sd_1', title: 'Design a URL Shortener', type: 'system_design', difficulty: 'medium', duration_minutes: 30, success_rate: 55, description: 'Design a URL shortening service like bit.ly. Cover the encoding scheme, storage, read/write paths, analytics, and how to handle high traffic.' },
  { id: 'ch_sd_2', title: 'Design a Chat Application', type: 'system_design', difficulty: 'hard', duration_minutes: 45, success_rate: 40, description: 'Design a real-time chat system supporting 1M concurrent users. Cover WebSocket connections, message persistence, presence, and offline delivery.' },
  { id: 'ch_sd_3', title: 'Design a Notification System', type: 'system_design', difficulty: 'medium', duration_minutes: 30, success_rate: 50, description: 'Design a notification service supporting push, email, and SMS. Cover prioritization, rate limiting, user preferences, and delivery guarantees.' },
  { id: 'ch_sd_4', title: 'Design a Rate Limiter', type: 'system_design', difficulty: 'medium', duration_minutes: 20, success_rate: 55, description: 'Design an API rate limiter. Discuss token bucket vs sliding window algorithms, distributed counters, and how to handle race conditions.' },
  { id: 'ch_bh_1', title: 'Describe a Production Incident', type: 'behavioral', difficulty: 'easy', duration_minutes: 15, success_rate: 70, description: 'Describe a time when you caused or resolved a production incident. What happened, how did you respond, and what did you learn? What preventive measures did you implement?' },
  { id: 'ch_bh_2', title: 'Disagreeing with a Technical Decision', type: 'behavioral', difficulty: 'medium', duration_minutes: 15, success_rate: 60, description: 'Tell me about a time you disagreed with a technical decision made by your team or manager. How did you handle it? What was the outcome?' },
  { id: 'ch_bh_3', title: 'Mentoring a Junior Engineer', type: 'behavioral', difficulty: 'easy', duration_minutes: 15, success_rate: 75, description: 'Describe how you have mentored a junior developer. What was your approach, what challenges did you face, and how did you measure success?' },
  { id: 'ch_bh_4', title: 'Tight Deadline Trade-offs', type: 'behavioral', difficulty: 'medium', duration_minutes: 15, success_rate: 65, description: 'Tell me about a time you had to ship under a tight deadline. What trade-offs did you make? How did you balance quality with speed?' },
  { id: 'ch_cr_1', title: 'Review: React Performance Bug', type: 'code_review', difficulty: 'medium', duration_minutes: 20, success_rate: 55, description: 'Review this React component that causes unnecessary re-renders. The component fetches data inside the render cycle and passes new objects as props on every render. Identify the issues and provide fixes.' },
  { id: 'ch_cr_2', title: 'Review: SQL Injection Risk', type: 'code_review', difficulty: 'easy', duration_minutes: 10, success_rate: 70, description: 'Review this Node.js route handler that constructs SQL queries using string interpolation. Identify the security vulnerability and provide the corrected version using parameterized queries.' },
  { id: 'ch_cr_3', title: 'Review: Race Condition in Cache', type: 'code_review', difficulty: 'hard', duration_minutes: 25, success_rate: 35, description: 'Review this caching layer that has a race condition between cache invalidation and cache population. Multiple concurrent requests can cause stale data to be written back to cache. Propose a solution.' },
  { id: 'ch_dbg_1', title: 'Debug: Silent API Failure', type: 'debugging', difficulty: 'medium', duration_minutes: 20, success_rate: 50, description: 'An API endpoint returns 200 but with empty data intermittently. Logs show the database query runs but returns no results despite data existing. Investigate: the issue is related to replica lag and inconsistent read preferences.' },
  { id: 'ch_dbg_2', title: 'Debug: Memory Leak in Node.js', type: 'debugging', difficulty: 'hard', duration_minutes: 25, success_rate: 30, description: 'A Node.js service gradually consumes more memory over hours until it crashes. Heap snapshots show growing event listener objects. Identify the root cause: event listeners are being added on every request without cleanup.' },
  { id: 'ch_dbg_3', title: 'Debug: Flaky Integration Test', type: 'debugging', difficulty: 'medium', duration_minutes: 20, success_rate: 55, description: 'An integration test passes locally but fails 30% of the time in CI. The test creates a user, then queries for it. The issue is a timing problem: the write has not been flushed to the read replica when the query runs.' },
  { id: 'ch_dbg_4', title: 'Debug: CSS Layout Shift', type: 'debugging', difficulty: 'easy', duration_minutes: 10, success_rate: 65, description: 'A web page exhibits layout shift when images load. The images have no explicit dimensions set. Fix the layout shift by adding proper aspect-ratio or width/height attributes and CSS.' },
]

async function ensureSeeded() {
  try {
    const db = await getMongoDb()
    const col = db.collection('challenges')
    const n = await col.estimatedDocumentCount()
    if (n > 0) return
    const now = new Date().toISOString()
    const docs = SEED_CHALLENGES.map((c) => ({
      ...c,
      created_at: now,
      updated_at: now,
    }))
    await col.insertMany(docs)
  } catch {
    console.warn('[CodeSpectra] challenges auto-seed skipped')
  }
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    await ensureSeeded()
    const db = await getMongoDb()
    const filter: Record<string, unknown> = gate.user.role === 'tenant_admin'
      ? (gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null })
      : {}
    const data = await db.collection('challenges').find(filter).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await request.json()) as Partial<ChallengeDoc>
    if (!body.title || !body.type) {
      return NextResponse.json({ error: 'title and type are required' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const doc: ChallengeDoc = {
      id: body.id || `ch_${Date.now()}`,
      title: body.title,
      type: body.type,
      difficulty: body.difficulty || 'medium',
      duration_minutes: body.duration_minutes || 15,
      success_rate: body.success_rate ?? 50,
      description: body.description || '',
      starter_code: body.starter_code ?? null,
      tenant_id: gate.user.tenantId || null,
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }
    const db = await getMongoDb()
    await db.collection('challenges').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[challenges]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
