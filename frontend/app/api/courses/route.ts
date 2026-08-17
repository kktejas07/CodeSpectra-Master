import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

const SEED_COURSES = [
  {
    id: 'dsa-basics',
    title: 'Data Structures & Algorithms Fundamentals',
    description: 'Master arrays, linked lists, stacks, queues, trees, and graphs with hands-on problems.',
    type: 'video',
    instructor: 'CodeSpectra',
    duration: '8 hours',
    level: 'beginner',
    rating: 4.7,
    tags: ['DSA', 'Arrays', 'Trees', 'Graphs'],
  },
  {
    id: 'python-mastery',
    title: 'Python Mastery for Coding Interviews',
    description: 'Deep dive into Python idioms, standard library, and interview patterns.',
    type: 'text',
    instructor: 'CodeSpectra',
    duration: '6 hours',
    level: 'intermediate',
    rating: 4.8,
    tags: ['Python', 'Interviews'],
  },
  {
    id: 'react-deep-dive',
    title: 'React: Hooks, Server Components & Performance',
    description: 'Modern React patterns with Server Components, Suspense, and concurrent rendering.',
    type: 'video',
    instructor: 'CodeSpectra',
    duration: '10 hours',
    level: 'advanced',
    rating: 4.9,
    tags: ['React', 'RSC', 'Hooks', 'Performance'],
  },
  {
    id: 'system-design',
    title: 'System Design for Senior Engineers',
    description: 'Scalability, caching, sharding, message queues, and distributed systems patterns.',
    type: 'text',
    instructor: 'CodeSpectra',
    duration: '12 hours',
    level: 'advanced',
    rating: 4.6,
    tags: ['System Design', 'Architecture', 'Distributed'],
  },
  {
    id: 'javascript-interview',
    title: 'JavaScript Interview Mastery',
    description: 'Closures, event loop, async patterns, prototypes, and common interview questions.',
    type: 'video',
    instructor: 'CodeSpectra',
    duration: '7 hours',
    level: 'intermediate',
    rating: 4.7,
    tags: ['JavaScript', 'Interviews', 'Async'],
  },
  {
    id: 'sql-practice',
    title: 'SQL for Data Engineers',
    description: 'Joins, window functions, CTEs, query optimization, and real-world data problems.',
    type: 'text',
    instructor: 'CodeSpectra',
    duration: '5 hours',
    level: 'beginner',
    rating: 4.5,
    tags: ['SQL', 'Databases', 'Analytics'],
  },
]

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const col = db.collection('courses')
    const count = await col.countDocuments()
    if (count === 0) {
      await col.insertMany(SEED_COURSES.map(c => ({ ...c, created_at: new Date().toISOString() })))
    }
    const data = await col.find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
