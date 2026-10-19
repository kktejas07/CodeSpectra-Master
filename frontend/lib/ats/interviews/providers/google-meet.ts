/**
 * Google Meet via Google Calendar (OAuth per tenant, scope calendar.events).
 * Create: POST /calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all
 *         with conferenceData.createRequest (hangoutsMeet) — Google emails the attendees.
 * Update: PATCH …/events/{id}?conferenceDataVersion=1&sendUpdates=all
 * Cancel: DELETE …/events/{id}?sendUpdates=all
 */
import { endIso, sendJson, type MeetingInput, type MeetingProviderImpl, type ProviderRequest } from './types'

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

function eventBody(input: MeetingInput) {
  return {
    summary: input.title.slice(0, 200),
    description: input.description.slice(0, 4000),
    start: { dateTime: new Date(input.start).toISOString(), timeZone: input.timeZone },
    end: { dateTime: endIso(input), timeZone: input.timeZone },
    attendees: input.attendees.map((a) => ({ email: a.email, ...(a.name ? { displayName: a.name } : {}) })),
    guestsCanInviteOthers: false,
    reminders: { useDefault: true },
  }
}

export function buildGoogleCreate(input: MeetingInput): ProviderRequest {
  return {
    method: 'POST',
    url: `${API}?conferenceDataVersion=1&sendUpdates=all`,
    body: {
      ...eventBody(input),
      conferenceData: {
        createRequest: { requestId: `cs-${input.interviewId}-${Date.parse(input.start)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
  }
}

export function buildGoogleUpdate(eventId: string, input: MeetingInput): ProviderRequest {
  return { method: 'PATCH', url: `${API}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`, body: eventBody(input) }
}

export function buildGoogleCancel(eventId: string): ProviderRequest {
  return { method: 'DELETE', url: `${API}/${encodeURIComponent(eventId)}?sendUpdates=all` }
}

type GEvent = {
  id?: string
  hangoutLink?: string
  htmlLink?: string
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
}

export function googleJoinUrl(ev: GEvent): string {
  return ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || ''
}

export const googleMeetProvider: MeetingProviderImpl = {
  id: 'google_meet',
  async createMeeting(ctx, input) {
    const ev = await sendJson<GEvent>(ctx, 'google_meet', buildGoogleCreate(input))
    const join = googleJoinUrl(ev)
    if (!ev.id || !join) throw new Error('Google Calendar did not return a Meet link')
    return { join_url: join, meeting_id: ev.id, host_url: ev.htmlLink ?? null }
  },
  async updateMeeting(ctx, eventId, input) {
    const ev = await sendJson<GEvent>(ctx, 'google_meet', buildGoogleUpdate(eventId, input))
    return { join_url: googleJoinUrl(ev), meeting_id: eventId, host_url: ev.htmlLink ?? null }
  },
  async cancelMeeting(ctx, eventId) {
    await sendJson(ctx, 'google_meet', buildGoogleCancel(eventId))
  },
}
