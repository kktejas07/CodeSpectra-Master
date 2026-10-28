import { NextRequest, NextResponse } from 'next/server'

/**
 * Legacy entry point. The working GitHub connect flow (stored, verified OAuth
 * state + a real callback) lives at /api/github/oauth/start.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/api/github/oauth/start', req.url))
}
