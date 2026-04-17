import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const mockApplications = [
    {
      id: '1',
      jobId: '1',
      jobTitle: 'Senior Full-Stack Developer',
      company: 'Tech Corp',
      appliedAt: '2024-04-17',
      status: 'in_review',
      resumeName: 'John_Resume.pdf',
    },
    {
      id: '2',
      jobId: '2',
      jobTitle: 'Frontend Engineer',
      company: 'StartUp Inc',
      appliedAt: '2024-04-15',
      status: 'rejected',
      resumeName: 'John_Resume.pdf',
    },
  ]

  return NextResponse.json(mockApplications)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    return NextResponse.json({
      success: true,
      applicationId: String(Math.random()),
      ...data,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create application' }, { status: 400 })
  }
}
