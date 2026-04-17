import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const mockResume = {
    id: params.id,
    fileName: 'John_Resume.pdf',
    fileSize: 245,
    uploadedAt: '2024-04-15',
    isPrimary: true,
    status: 'analyzed',
    analysis: {
      skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Python'],
      experience: '5 years in full-stack development',
      education: 'BS in Computer Science',
      jobMatches: [
        { jobId: '1', matchScore: 92, title: 'Senior Full-Stack Developer' },
      ],
    },
  }

  return NextResponse.json(mockResume)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, deletedId: params.id })
}
