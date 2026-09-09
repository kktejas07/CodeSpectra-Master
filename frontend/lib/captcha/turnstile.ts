/**
 * Cloudflare Turnstile bot defense for auth flows.
 *
 * Fail-closed when configured (TURNSTILE_SECRET_KEY set): a missing or
 * invalid token rejects the login. Fail-open with a warning when keys are
 * absent so a fresh deploy never locks everyone out before the admin
 * pastes keys (see frontend/.env.example).
 */

interface VerifyResult {
  ok: boolean
  /** True when verification was skipped because no secret is configured. */
  skipped?: boolean
  error?: string
}

async function getSecret(): Promise<string> {
  try {
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const s = (await readServerSecrets()) as Record<string, unknown>
    const v = typeof s.turnstile_secret_key === 'string' ? s.turnstile_secret_key.trim() : ''
    if (v && !v.includes('•')) return v
  } catch {
    /* fall through to env */
  }
  return (process.env.TURNSTILE_SECRET_KEY || '').trim()
}

export async function isCaptchaConfigured(): Promise<boolean> {
  return (await getSecret()).length > 0
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<VerifyResult> {
  const secret = await getSecret()
  if (!secret) {
    console.warn('[captcha] TURNSTILE_SECRET_KEY not configured — skipping verification')
    return { ok: true, skipped: true }
  }
  if (!token || typeof token !== 'string' || token.length < 10) {
    return { ok: false, error: 'missing-token' }
  }
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      'error-codes'?: string[]
    }
    if (json.success) return { ok: true }
    return { ok: false, error: (json['error-codes'] || ['unknown']).join(',') }
  } catch (e) {
    // Cloudflare unreachable — fail closed when keys exist (bot defense
    // must not silently disable itself), surface as 503 upstream.
    return { ok: false, error: e instanceof Error ? `verify-error:${e.message}` : 'verify-error' }
  }
}
