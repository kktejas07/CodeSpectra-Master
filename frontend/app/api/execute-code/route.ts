import { NextRequest, NextResponse } from 'next/server'
import { executeOnce } from '@/lib/piston'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { language, source, stdin } = body

    if (!language || !source) {
      return NextResponse.json(
        { success: false, error: 'language and source are required' },
        { status: 400 }
      )
    }

    const result = await executeOnce({
      language: language.toLowerCase(),
      source,
      stdin: stdin || '',
      timeoutMs: 10000,
    })

    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Execution failed' },
      { status: 500 }
    )
  }
}
