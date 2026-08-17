import { NextRequest, NextResponse } from 'next/server'
import { backendGet, backendPost } from '@/lib/ai/backend'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryString = searchParams.toString()
    const url = `/internal/learning/progress${queryString ? `?${queryString}` : ''}`
    const data = await backendGet(url)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = await backendPost('/internal/learning/progress', body)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}