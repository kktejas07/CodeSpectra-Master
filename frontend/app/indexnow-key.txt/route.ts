/** GET /indexnow-key.txt — IndexNow ownership key (keyLocation). 404 until an admin sets one. */
import { getSeoSettings } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { indexnow_key: key } = await getSeoSettings()
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
