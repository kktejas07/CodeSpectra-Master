import { NextRequest, NextResponse } from 'next/server'
import { backendGet } from '@/lib/ai/backend'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryString = searchParams.toString()
    const url = `/internal/learning/courses${queryString ? `?${queryString}` : ''}`
    const data = await backendGet(url)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
  }
}