import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    return NextResponse.json({
      success: true,
      applicationId: String(Math.random()),
      jobId: params.id,
      appliedAt: new Date().toISOString(),
      ...data,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to apply for job' }, { status: 400 })
  }
}
