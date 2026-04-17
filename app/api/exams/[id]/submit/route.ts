import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    const score = Math.floor(Math.random() * 100)
    const passed = score >= 70

    return NextResponse.json({
      success: true,
      examId: params.id,
      score,
      passed,
      submittedAt: new Date().toISOString(),
      certificateUrl: passed ? `/certificates/${params.id}` : null,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to submit exam' }, { status: 400 })
  }
}
