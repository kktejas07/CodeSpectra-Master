import { NextResponse } from 'next/server'

/**
 * Legacy Sonar-style path. Use **`/api/quality-gates`** (cookie session + `user_id` scope) instead.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      error: 'Use GET /api/quality-gates with credentials: include.',
    },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      error: 'Use POST /api/quality-gates with credentials: include.',
    },
    { status: 410 }
  )
}
