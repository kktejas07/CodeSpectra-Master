import { NextRequest } from 'next/server'
import { handleOAuthCallback } from '../../_callback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** OAuth redirect URI for microsoft (register exactly this path with the app). */
export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, 'microsoft')
}
