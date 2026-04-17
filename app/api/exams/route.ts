import { NextResponse } from 'next/server'

const mockExams = [
  {
    id: '1',
    title: 'JavaScript Fundamentals',
    subject: 'JavaScript',
    level: 'Beginner',
    duration: 60,
    questions: 50,
    passingScore: 70,
    description: 'Test your knowledge of JavaScript basics',
    status: 'available',
  },
  {
    id: '2',
    title: 'React Advanced Patterns',
    subject: 'React',
    level: 'Advanced',
    duration: 90,
    questions: 40,
    passingScore: 75,
    description: 'Master advanced React patterns and hooks',
    status: 'available',
  },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const subject = searchParams.get('subject')

  let filtered = mockExams

  if (level) filtered = filtered.filter(exam => exam.level === level)
  if (subject) filtered = filtered.filter(exam => exam.subject === subject)

  return NextResponse.json(filtered)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    return NextResponse.json({
      id: String(Math.random()),
      ...data,
      status: 'available',
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 400 })
  }
}
