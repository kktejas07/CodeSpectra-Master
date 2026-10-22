/**
 * GET /api/pro-certs — published certifications (catalog) + the signed-in
 * learner's credentials and open attempts.
 */
import { requireAuth } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await requireAuth()
  if ('error' in g) return json({ error: g.error, code: 'unauthorized' }, g.status)
  try {
    const { loadPublishedPrograms, myCredentials, myOpenAttempts } = await import('@/lib/pro-certs/service')
    const [programs, credentials, open] = await Promise.all([loadPublishedPrograms(), myCredentials(g.user.id), myOpenAttempts(g.user.id)])
    return json({ programs, credentials: credentials.map((c) => ({ id: c.id, program_slug: c.program_slug, program_title: c.program_title, issued_at: c.issued_at, expires_at: c.expires_at, state: c.state })), open_attempts: open })
  } catch (e) {
    return errorJson(e, 'catalog GET')
  }
}
