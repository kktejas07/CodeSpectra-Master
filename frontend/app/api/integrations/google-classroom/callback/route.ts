/** GET — Google OAuth callback (signed state: tenant, user, expiry) → back to Connected apps. */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const { getAppOrigin } = await import('@/lib/app-origin')
  const back = (status: string) => NextResponse.redirect(`${getAppOrigin()}/dashboard/admin/connected-apps?classroom=${status}`, { status: 303 })
  const { verifyState, completeConnect } = await import('@/lib/integrations/classroom')
  const state = await verifyState(url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  if (!state || !code || url.searchParams.get('error')) return back('cancelled')
  // The browser finishing the flow must be the admin who started it.
  const a = await requireAuth()
  if ('error' in a || a.user.id !== state.u) return back('wrong_account')
  try {
    await completeConnect(state, code.slice(0, 2000))
    return back('connected')
  } catch (e) {
    console.error('[classroom] callback failed', (e as Error)?.message)
    return back('failed')
  }
}
