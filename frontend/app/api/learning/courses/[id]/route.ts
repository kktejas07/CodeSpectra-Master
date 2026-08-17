import { NextRequest, NextResponse } from 'next/server'
import { backendGet } from '@/lib/ai/backend'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const data = await backendGet(`/internal/learning/courses/${id}`)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
  }
}