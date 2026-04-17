import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mockCodeathon = {
    id: params.id,
    title: 'Summer Code Challenge 2024',
    description: 'Build innovative solutions for real-world problems',
    startDate: '2024-06-01',
    endDate: '2024-06-30',
    prizePool: '$50,000',
    participants: 234,
    status: 'upcoming',
    rules: 'Follow community guidelines and code of conduct',
    tracks: ['Web Development', 'Mobile', 'AI/ML', 'Infrastructure'],
    challenges: [
      {
        id: 'ch1',
        title: 'Build a Social App',
        difficulty: 'Hard',
        points: 1000,
      },
    ],
  }

  return NextResponse.json(mockCodeathon)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    return NextResponse.json({ id: params.id, ...data })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update codeathon' }, { status: 400 })
  }
}
