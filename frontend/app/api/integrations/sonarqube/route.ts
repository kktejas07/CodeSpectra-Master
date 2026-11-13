import { NextResponse } from 'next/server'
import { apiErrorFor } from '@/lib/api-errors'

/**
 * SonarQube uses token-based authentication, not OAuth.
 * Configure it via PUT /api/integrations/tenant/sonarqube with { url, token, org? }.
 * This endpoint is kept as a no-op redirect target for the legacy connect flow.
 */
export async function GET() {
  return NextResponse.json(
    apiErrorFor('sonar_token_auth'),
    { status: 405 },
  )
}
