/**
 * External ATS push — send one candidate's result to Greenhouse, Lever, or Workday.
 * Called only from the manual "Push to ATS" action (app/api/admin/integrations/ats-push).
 *
 * ponytail: webhook-out only (no inbound OAuth dance), zero new deps.
 */
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { readTextCapped, safeFetch, safePreview } from '@/lib/url-safety'

const TIMEOUT_MS = 10_000

export interface AtsCandidatePayload {
  /** CodeSpectra user id */
  userId: string
  name: string
  email: string
  /** Assessment / exam title */
  assessmentTitle: string
  /** Score 0–100 */
  score: number
  /** ISO timestamp of submission */
  submittedAt: string
  /** Permalink to the recruiter results page */
  resultsUrl: string
  /** Optional: role the candidate applied for */
  role?: string
}

export type AtsProvider = 'greenhouse' | 'lever' | 'workday'

export interface AtsPushResult {
  provider: AtsProvider
  ok: boolean
  status?: number
  error?: string
  remoteId?: string
}

/** A provider said no: keep its reply in the server log, hand the browser only the status. */
async function failed(provider: AtsProvider, res: Response): Promise<AtsPushResult> {
  const text = await readTextCapped(res, 2048, { truncate: true }).catch(() => '')
  console.warn(`[ats-push] ${provider} replied ${res.status}: ${safePreview(text, 300)}`)
  return { provider, ok: false, status: res.status, error: `${provider} rejected the request (HTTP ${res.status})` }
}

/** One provider never takes the others down: timeouts and network errors become a failed result. */
async function attempt(provider: AtsProvider, run: () => Promise<AtsPushResult>): Promise<AtsPushResult> {
  try {
    return await run()
  } catch (e) {
    console.warn(`[ats-push] ${provider} failed:`, (e as Error).message)
    return { provider, ok: false, error: `Could not reach ${provider}` }
  }
}

// ─── Greenhouse ───────────────────────────────────────────────────────────────

async function pushToGreenhouse(
  apiKey: string,
  onBehalfOf: string,
  c: AtsCandidatePayload,
): Promise<AtsPushResult> {
  const [firstName, ...rest] = c.name.split(' ')
  const body = {
    first_name: firstName,
    last_name: rest.join(' ') || '-',
    email_addresses: [{ value: c.email, type: 'personal' }],
    social_media_addresses: [{ value: c.resultsUrl, type: 'other' }],
    notes: `CodeSpectra assessment: "${c.assessmentTitle}" — score ${c.score}/100 on ${c.submittedAt}`,
  }
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const res = await fetch('https://harvest.greenhouse.io/v1/prospects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      // Harvest writes must name a real, active Greenhouse user (audit trail); a made-up id is rejected.
      'On-Behalf-Of': onBehalfOf,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return failed('greenhouse', res)
  const json = await res.json().catch(() => ({})) as { id?: number }
  return { provider: 'greenhouse', ok: true, status: res.status, remoteId: String(json.id ?? '') }
}

// ─── Lever ────────────────────────────────────────────────────────────────────

async function pushToLever(
  apiKey: string,
  performAs: string,
  c: AtsCandidatePayload,
): Promise<AtsPushResult> {
  const body = {
    name: c.name,
    emails: [c.email],
    links: [c.resultsUrl],
    headline: c.role || `Applicant via CodeSpectra`,
    notes: `CodeSpectra assessment: "${c.assessmentTitle}" — score ${c.score}/100 on ${c.submittedAt}`,
    tags: ['codespectra'],
  }
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  // Lever needs perform_as: the Lever user who becomes creator and owner of the opportunity.
  const res = await fetch(`https://api.lever.co/v1/opportunities?perform_as=${encodeURIComponent(performAs)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return failed('lever', res)
  const json = await res.json().catch(() => ({})) as { data?: { id?: string } }
  return { provider: 'lever', ok: true, status: res.status, remoteId: json.data?.id ?? '' }
}

// ─── Workday (generic webhook) ────────────────────────────────────────────────

async function pushToWorkday(
  webhookUrl: string,
  secret: string | undefined,
  c: AtsCandidatePayload,
): Promise<AtsPushResult> {
  const payload = {
    source: 'codespectra',
    event: 'assessment.result',
    candidate: { name: c.name, email: c.email, userId: c.userId },
    assessment: {
      title: c.assessmentTitle,
      score: c.score,
      submittedAt: c.submittedAt,
      resultsUrl: c.resultsUrl,
    },
  }
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) {
    // HMAC-SHA256 signature — same pattern as Razorpay / Stripe webhooks
    const { createHmac } = await import('crypto')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    headers['X-CodeSpectra-Signature'] = sig
  }
  // Admin-entered URL → safeFetch (public addresses only, redirects re-checked).
  const res = await safeFetch(webhookUrl, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return failed('workday', res)
  return { provider: 'workday', ok: true, status: res.status }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Push a candidate to every configured ATS provider.
 * Returns one result per configured provider (empty if none configured).
 */
export async function pushCandidateToAts(
  candidate: AtsCandidatePayload,
): Promise<AtsPushResult[]> {
  const secrets = await readServerSecrets()
  const results: AtsPushResult[] = []

  const ghKey = secrets.greenhouse_api_key?.trim()
  if (ghKey) {
    const ghUser = secrets.greenhouse_user_id?.trim()
    results.push(ghUser
      ? await attempt('greenhouse', () => pushToGreenhouse(ghKey, ghUser, candidate))
      : { provider: 'greenhouse', ok: false, error: 'Greenhouse user ID is not set — reconnect Greenhouse in Admin → Integrations' })
  }
  const leverKey = secrets.lever_api_key?.trim()
  if (leverKey) {
    const leverUser = secrets.lever_user_id?.trim()
    results.push(leverUser
      ? await attempt('lever', () => pushToLever(leverKey, leverUser, candidate))
      : { provider: 'lever', ok: false, error: 'Lever user ID is not set — reconnect Lever in Admin → Integrations' })
  }
  const workdayUrl = secrets.workday_webhook_url?.trim()
  if (workdayUrl) {
    results.push(await attempt('workday', () => pushToWorkday(workdayUrl, secrets.workday_webhook_secret?.trim(), candidate)))
  }

  return results
}
