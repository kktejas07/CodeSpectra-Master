import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

const SEED_TRACKS = [
  { id: 'python', name: 'Python', description: 'Core syntax, data structures, OOP, decorators, async, pytest.', topics: ['Strings', 'Lists', 'Dicts', 'OOP', 'Iterators', 'Asyncio'], tone: 'border-emerald-500/30 bg-emerald-500/5', badge: 'Most popular' },
  { id: 'javascript', name: 'JavaScript / TypeScript', description: 'ES2024+, closures, async/await, Node.js patterns, types.', topics: ['Closures', 'Promises', 'Map/Set', 'TS generics', 'Event loop'], tone: 'border-amber-500/30 bg-amber-500/5' },
  { id: 'dsa', name: 'DSA — Data Structures & Algorithms', description: 'Arrays, Trees, Graphs, DP, Greedy, Two-pointer, Tries.', topics: ['Arrays', 'Trees', 'Graphs', 'DP', 'Greedy', 'Bit manipulation'], tone: 'border-primary/30 bg-primary/5', badge: 'Interview core' },
  { id: 'react', name: 'React', description: 'Hooks, Suspense, RSC, state management, performance.', topics: ['Hooks', 'Context', 'RSC', 'Forms', 'Performance'], tone: 'border-cyan-500/30 bg-cyan-500/5' },
  { id: 'node', name: 'Node.js & Backend', description: 'Express/Fastify, streams, auth, queues, observability.', topics: ['HTTP', 'Streams', 'Auth', 'Queues', 'Caching'], tone: 'border-green-500/30 bg-green-500/5' },
  { id: 'sql', name: 'SQL', description: 'Joins, window functions, query plans, optimization.', topics: ['SELECT', 'JOINs', 'Window fns', 'CTEs', 'Indexes'], tone: 'border-fuchsia-500/30 bg-fuchsia-500/5' },
  { id: 'java', name: 'Java', description: 'Collections, streams, concurrency, JVM tuning, Spring.', topics: ['Collections', 'Streams', 'Concurrency', 'JVM', 'Generics'], tone: 'border-orange-500/30 bg-orange-500/5' },
  { id: 'cpp', name: 'C++', description: 'STL, move semantics, templates, memory, performance.', topics: ['STL', 'Templates', 'Move semantics', 'Smart pointers', 'CRTP'], tone: 'border-rose-500/30 bg-rose-500/5' },
  { id: 'system_design', name: 'System Design', description: 'Scalability, caching, sharding, queues, consistency, design patterns.', topics: ['Sharding', 'Caching', 'Queues', 'Consistency', 'Rate limits'], tone: 'border-indigo-500/30 bg-indigo-500/5', badge: 'Senior+' },
]

export async function GET() {
  try {
    const db = await getMongoDb()
    const col = db.collection('tracks')
    const count = await col.countDocuments()
    if (count === 0) {
      await col.insertMany(SEED_TRACKS.map(t => ({ ...t, created_at: new Date().toISOString() })))
    }
    const data = await col.find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
