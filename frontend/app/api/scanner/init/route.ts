import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/scanner/init — legacy endpoint. Originally seeded SonarQube-style
 * project data through Supabase. After the MongoDB migration the seed lives
 * in `lib/db/seed-problems.ts` and runs automatically on first DB connect,
 * so this endpoint is now a no-op kept for API compatibility.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Scanner seed data is now auto-initialized on startup. This endpoint is a no-op.',
  })
}

export async function GET() {
  return NextResponse.json({ status: 'ready' })
}
