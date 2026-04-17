import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const mockResumes = [
    {
      id: '1',
      fileName: 'John_Resume.pdf',
      fileSize: 245,
      uploadedAt: '2024-04-15',
      isPrimary: true,
      status: 'analyzed',
    },
    {
      id: '2',
      fileName: 'John_Resume_v2.pdf',
      fileSize: 256,
      uploadedAt: '2024-04-10',
      isPrimary: false,
      status: 'analyzed',
    },
  ]

  return NextResponse.json(mockResumes)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    return NextResponse.json({
      id: String(Math.random()),
      ...data,
      uploadedAt: new Date().toISOString().split('T')[0],
      status: 'analyzing',
      isPrimary: false,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 400 })
  }
}
