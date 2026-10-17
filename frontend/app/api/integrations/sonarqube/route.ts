import { NextResponse } from 'next/server'

/**
 * SonarQube connect is not built yet: there is no OAuth callback route and no
 * stored state, so starting the flow only led to a 404 on return. Say so
 * plainly instead of redirecting to the provider.
 */
export async function GET() {
  return NextResponse.json({ error: "SonarQube integration isn't available yet." }, { status: 501 })
}
