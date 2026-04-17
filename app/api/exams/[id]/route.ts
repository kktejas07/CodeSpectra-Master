import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mockExam = {
    id: params.id,
    title: 'JavaScript Fundamentals',
    subject: 'JavaScript',
    level: 'Beginner',
    duration: 60,
    questions: 50,
    passingScore: 70,
    description: 'Test your knowledge of JavaScript basics',
    status: 'available',
    questions: [
      {
        id: '1',
        text: 'What is JavaScript?',
        type: 'multiple-choice',
        options: ['Language', 'Framework', 'Library', 'Database'],
        correctAnswer: 0,
      },
    ],
  }

  return NextResponse.json(mockExam)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    return NextResponse.json({ id: params.id, ...data })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 400 })
  }
}
