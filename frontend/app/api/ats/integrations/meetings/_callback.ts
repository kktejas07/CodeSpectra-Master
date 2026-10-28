import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { auditAts, resolveActorFor } from '@/lib/ats/access'
import { completeOAuth, verifyOAuthState } from '@/lib/ats/interviews/integrations'
import { getAppOrigin } from '@/lib/app-origin'

const PAGE = '/dashboard/hiring/settings/integrations'

function back(params: Record<string, string>): NextResponse {
  const url = new URL(PAGE, getAppOrigin())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

/**
 * Shared OAuth callback: the signed state must be valid, issued to the same
 * signed-in user, who must still be an ATS admin of the state's tenant.
 */
export async function handleOAuthCallback(req: NextRequest, which: 'google' | 'microsoft'): Promise<NextResponse> {
  const sp = new URL(req.url).searchParams
  const provider = which === 'google' ? 'google_meet' : 'teams'
  const state = await verifyOAuthState(sp.get('state'))
  if (!state || state.i !== provider || !state.t || !state.u) return back({ error: 'The sign-in link expired. Start again.' })
  const withTenant = { tenant: state.t }
  if (sp.get('error')) return back({ ...withTenant, error: sp.get('error_description')?.slice(0, 200) || 'Sign-in was cancelled.' })
  const code = sp.get('code')
  if (!code || code.length > 4000) return back({ ...withTenant, error: 'No authorisation code was returned.' })
  const user = await getAPIUser()
  if (!user || user.id !== state.u) return back({ ...withTenant, error: 'Sign in to CodeSpectra as the admin who started the connection.' })
  const actor = await resolveActorFor(user, state.t)
  if (!actor || actor.role !== 'admin') return back({ ...withTenant, error: 'Only hiring admins can connect meeting apps.' })
  try {
    await completeOAuth(which, state, code)
    await auditAts(actor, 'ats.meetings.connect', 'meeting_integration', provider, undefined, req).catch(() => {})
    return back({ ...withTenant, connected: provider })
  } catch (e) {
    console.error('[ats/meetings] oauth callback failed:', e)
    return back({ ...withTenant, error: e instanceof Error ? e.message.slice(0, 200) : 'Connection failed.' })
  }
}
