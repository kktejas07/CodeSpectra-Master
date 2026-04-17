import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mockJob = {
    id: params.id,
    title: 'Senior Full-Stack Developer',
    company: 'Tech Corp',
    location: 'San Francisco, CA',
    salary: { min: 150000, max: 200000, currency: 'USD' },
    jobType: 'Full-time',
    experienceLevel: 'Senior',
    description: 'Looking for experienced full-stack developer to join our team',
    requirements: '5+ years experience with modern web technologies',
    benefits: 'Health insurance, 401k, Remote work options',
    skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
    applicants: 24,
    postedAt: '2 days ago',
  }

  return NextResponse.json(mockJob)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    return NextResponse.json({ id: params.id, ...data })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update job' }, { status: 400 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, deletedId: params.id })
