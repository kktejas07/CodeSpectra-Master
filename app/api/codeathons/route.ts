import { NextResponse } from 'next/server'

const mockCodeathons = [
  {
    id: '1',
    title: 'Summer Code Challenge 2024',
    description: 'Build innovative solutions for real-world problems',
    startDate: '2024-06-01',
    endDate: '2024-06-30',
    prizePool: '$50,000',
    participants: 234,
    status: 'upcoming',
  },
  {
    id: '2',
    title: 'AI/ML Hackathon',
    description: 'Create AI solutions using modern machine learning tools',
    startDate: '2024-07-15',
    endDate: '2024-07-17',
    prizePool: '$100,000',
    participants: 567,
    status: 'upcoming',
  },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let filtered = mockCodeathons

  if (status) filtered = filtered.filter(c => c.status === status)

  return NextResponse.json(filtered)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    return NextResponse.json({
      id: String(Math.random()),
      ...data,
      participants: 0,
      status: 'upcoming',
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create codeathon' }, { status: 400 })
  }
}
