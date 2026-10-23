/** GET — the tool's public key set (platforms verify our deep-linking responses and AGS client assertions with it). */
import { errorResponse } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { publicJwks } = await import('@/lib/integrations/lti/service')
    return Response.json(await publicJwks(), { headers: { 'Cache-Control': 'public, max-age=300' } })
  } catch (e) { return errorResponse(e, 'lti jwks') }
}
