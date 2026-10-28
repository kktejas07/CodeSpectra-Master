/**
 * Zoom (Server-to-Server OAuth app per tenant).
 * Token: POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=…
 *        (Basic client_id:client_secret) — handled in ../integrations.ts.
 * Create: POST https://api.zoom.us/v2/users/me/meetings
 * Update: PATCH /v2/meetings/{id}    Cancel: DELETE /v2/meetings/{id}
 */
import { sendJson, type MeetingInput, type MeetingProviderImpl, type ProviderRequest } from './types'

const API = 'https://api.zoom.us/v2'

/** Zoom wants GMT without milliseconds: 2026-10-20T10:00:00Z */
export function zoomTime(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function meetingBody(input: MeetingInput) {
  return {
    topic: input.title.slice(0, 200),
    type: 2, // scheduled
    start_time: zoomTime(input.start),
    duration: input.durationMin,
    timezone: input.timeZone,
    agenda: input.description.slice(0, 2000),
    settings: {
      join_before_host: false,
      waiting_room: true,
      mute_upon_entry: true,
      approval_type: 2, // no registration
      meeting_invitees: input.attendees.map((a) => ({ email: a.email })),
    },
  }
}

export function buildZoomCreate(input: MeetingInput): ProviderRequest {
  return { method: 'POST', url: `${API}/users/me/meetings`, body: meetingBody(input) }
}

export function buildZoomUpdate(meetingId: string, input: MeetingInput): ProviderRequest {
  return { method: 'PATCH', url: `${API}/meetings/${encodeURIComponent(meetingId)}`, body: meetingBody(input) }
}

export function buildZoomCancel(meetingId: string): ProviderRequest {
  return { method: 'DELETE', url: `${API}/meetings/${encodeURIComponent(meetingId)}?schedule_for_reminder=true` }
}

export const zoomProvider: MeetingProviderImpl = {
  id: 'zoom',
  async createMeeting(ctx, input) {
    const r = await sendJson<{ id?: number | string; join_url?: string; start_url?: string }>(ctx, 'zoom', buildZoomCreate(input))
    if (!r.join_url || r.id === undefined) throw new Error('Zoom did not return a meeting link')
    return { join_url: r.join_url, meeting_id: String(r.id), host_url: r.start_url ?? null }
  },
  async updateMeeting(ctx, meetingId, input) {
    await sendJson(ctx, 'zoom', buildZoomUpdate(meetingId, input))
    // PATCH returns 204; the join link is unchanged.
    const r = await sendJson<{ join_url?: string; start_url?: string }>(ctx, 'zoom', { method: 'GET', url: `${API}/meetings/${encodeURIComponent(meetingId)}` })
    return { join_url: r.join_url || '', meeting_id: meetingId, host_url: r.start_url ?? null }
  },
  async cancelMeeting(ctx, meetingId) {
    await sendJson(ctx, 'zoom', buildZoomCancel(meetingId))
  },
}
