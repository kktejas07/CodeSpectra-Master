import { NextResponse } from 'next/server'

/**
 * SonarQube uses token-based authentication, not OAuth.
 * Configure it via PUT /api/integrations/tenant/sonarqube with { url, token, org? }.
 * This endpoint is kept as a no-op redirect target for the legacy connect flow.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'SonarQube uses token auth. Configure at /api/integrations/tenant/sonarqube.' },
    { status: 405 },
  )
}
