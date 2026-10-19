/**
 * Microsoft Teams via Microsoft Graph (delegated OAuth per tenant:
 * Calendars.ReadWrite + OnlineMeetings.ReadWrite + offline_access).
 * Create: POST https://graph.microsoft.com/v1.0/me/events
 *         { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } —
 *         Outlook sends the invites.
 * Update: PATCH /me/events/{id}     Cancel: POST /me/events/{id}/cancel
 */
import { escapeHtml } from '@/lib/safe-html'
import { endIso, sendJson, type MeetingInput, type MeetingProviderImpl, type ProviderRequest } from './types'

const API = 'https://graph.microsoft.com/v1.0/me/events'

/** Graph wants a local date-time without offset plus a zone name; we send UTC. */
function graphTime(iso: string) {
  return { dateTime: new Date(iso).toISOString().replace(/Z$/, ''), timeZone: 'UTC' }
}

function eventBody(input: MeetingInput) {
  return {
    subject: input.title.slice(0, 200),
    body: { contentType: 'HTML', content: escapeHtml(input.description.slice(0, 4000)).replace(/\n/g, '<br/>') },
    start: graphTime(input.start),
    end: graphTime(endIso(input)),
    attendees: input.attendees.map((a) => ({ emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) }, type: 'required' })),
    allowNewTimeProposals: false,
  }
}

export function buildTeamsCreate(input: MeetingInput): ProviderRequest {
  return {
    method: 'POST',
    url: API,
    body: { ...eventBody(input), isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' },
  }
}

export function buildTeamsUpdate(eventId: string, input: MeetingInput): ProviderRequest {
  return { method: 'PATCH', url: `${API}/${encodeURIComponent(eventId)}`, body: eventBody(input) }
}

export function buildTeamsCancel(eventId: string): ProviderRequest {
  return { method: 'POST', url: `${API}/${encodeURIComponent(eventId)}/cancel`, body: { comment: 'This interview was cancelled.' } }
}

type GraphEvent = { id?: string; webLink?: string; onlineMeeting?: { joinUrl?: string } | null; onlineMeetingUrl?: string | null }

export const teamsProvider: MeetingProviderImpl = {
  id: 'teams',
  async createMeeting(ctx, input) {
    const ev = await sendJson<GraphEvent>(ctx, 'teams', buildTeamsCreate(input))
    const join = ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl || ''
    if (!ev.id || !join) throw new Error('Microsoft Graph did not return a Teams link (is the account a work/school account with Teams?)')
    return { join_url: join, meeting_id: ev.id, host_url: ev.webLink ?? null }
  },
  async updateMeeting(ctx, eventId, input) {
    const ev = await sendJson<GraphEvent>(ctx, 'teams', buildTeamsUpdate(eventId, input))
    return { join_url: ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl || '', meeting_id: eventId, host_url: ev.webLink ?? null }
  },
  async cancelMeeting(ctx, eventId) {
    await sendJson(ctx, 'teams', buildTeamsCancel(eventId))
  },
}
