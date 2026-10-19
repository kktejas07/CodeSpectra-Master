import type { MeetingProvider } from '@/lib/ats/contract'

export interface MeetingInput {
  interviewId: string
  title: string
  /** plain text agenda */
  description: string
  /** ISO start (UTC) */
  start: string
  durationMin: number
  timeZone: string
  attendees: { email: string; name?: string }[]
  /** manual: the link the recruiter pasted (validated https) */
  manualUrl?: string
}

export interface MeetingResult {
  join_url: string
  meeting_id: string
  host_url?: string | null
}

/** What a provider needs from the integration layer: an access token and fetch. */
export interface ProviderContext {
  tenantId: string
  getAccessToken: () => Promise<string>
  fetch: typeof fetch
  /** app origin, for links to built-in pages */
  origin: string
}

export interface MeetingProviderImpl {
  id: MeetingProvider
  createMeeting(ctx: ProviderContext, input: MeetingInput): Promise<MeetingResult>
  updateMeeting(ctx: ProviderContext, meetingId: string, input: MeetingInput): Promise<MeetingResult>
  cancelMeeting(ctx: ProviderContext, meetingId: string): Promise<void>
}

/** A request a provider would send — built by pure functions so tests can assert it. */
export interface ProviderRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: MeetingProvider,
    message: string,
    public readonly code: 'not_connected' | 'auth' | 'api' | 'config' = 'api',
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  livekit: 'CodeSpectra video (built in)',
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  manual: 'Manual link',
}

export function endIso(input: Pick<MeetingInput, 'start' | 'durationMin'>): string {
  return new Date(Date.parse(input.start) + input.durationMin * 60_000).toISOString()
}

/** Send a ProviderRequest with a bearer token; parse JSON; map errors. */
export async function sendJson<T = Record<string, unknown>>(
  ctx: ProviderContext,
  provider: MeetingProvider,
  req: ProviderRequest,
): Promise<T> {
  const token = await ctx.getAccessToken()
  const res = await ctx.fetch(req.url, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 204 || res.status === 202) return {} as T
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'auth' : 'api'
    throw new ProviderError(provider, `${PROVIDER_LABELS[provider]} returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`, code, res.status)
  }
  if (!text) return {} as T
  try { return JSON.parse(text) as T } catch { return {} as T }
}
