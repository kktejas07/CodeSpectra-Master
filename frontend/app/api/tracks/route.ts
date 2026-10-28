import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

// Theme-token tone (royal blue `primary`), the same for every track. Older
// seeded docs may carry per-colour classes (e.g. emerald); GET normalises them.
const TONE = 'border-primary/30 bg-primary/5'

const SEED_TRACKS = [
  { id: 'python', name: 'Python', description: 'Core syntax, data structures, OOP, decorators, async, pytest.', topics: ['Strings', 'Lists', 'Dicts', 'OOP', 'Iterators', 'Asyncio'], tone: TONE, badge: 'Most popular' },
  { id: 'javascript', name: 'JavaScript / TypeScript', description: 'ES2024+, closures, async/await, Node.js patterns, types.', topics: ['Closures', 'Promises', 'Map/Set', 'TS generics', 'Event loop'], tone: TONE },
  { id: 'dsa', name: 'DSA — Data Structures & Algorithms', description: 'Arrays, Trees, Graphs, DP, Greedy, Two-pointer, Tries.', topics: ['Arrays', 'Trees', 'Graphs', 'DP', 'Greedy', 'Bit manipulation'], tone: TONE, badge: 'Interview core' },
  { id: 'react', name: 'React', description: 'Hooks, Suspense, RSC, state management, performance.', topics: ['Hooks', 'Context', 'RSC', 'Forms', 'Performance'], tone: TONE },
  { id: 'node', name: 'Node.js & Backend', description: 'Express/Fastify, streams, auth, queues, observability.', topics: ['HTTP', 'Streams', 'Auth', 'Queues', 'Caching'], tone: TONE },
  { id: 'sql', name: 'SQL', description: 'Joins, window functions, query plans, optimization.', topics: ['SELECT', 'JOINs', 'Window fns', 'CTEs', 'Indexes'], tone: TONE },
  { id: 'java', name: 'Java', description: 'Collections, streams, concurrency, JVM tuning, Spring.', topics: ['Collections', 'Streams', 'Concurrency', 'JVM', 'Generics'], tone: TONE },
  { id: 'cpp', name: 'C++', description: 'STL, move semantics, templates, memory, performance.', topics: ['STL', 'Templates', 'Move semantics', 'Smart pointers', 'CRTP'], tone: TONE },
  { id: 'system_design', name: 'System design', description: 'Scalability, caching, sharding, queues, consistency, design patterns.', topics: ['Sharding', 'Caching', 'Queues', 'Consistency', 'Rate limits'], tone: TONE, badge: 'Senior+' },
]

export async function GET() {
  try {
    const db = await getMongoDb()
    const col = db.collection('tracks')
    const count = await col.countDocuments()
    if (count === 0) {
      await col.insertMany(SEED_TRACKS.map(t => ({ ...t, created_at: new Date().toISOString() })))
    }
    const data = (await col.find({}).toArray()).map((t) => ({ ...t, tone: TONE }))
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}
