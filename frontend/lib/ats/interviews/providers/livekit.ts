/**
 * Built-in video (LiveKit). Rooms are created on first join, so no API call is
 * needed here: the room is `ats-interview-{id}`. `join_url` is the panel's room
 * page; candidates get their own signed link (/interview/join/[token]) built by
 * the service, so a team member can never join under the candidate's seat.
 * Tokens: app/api/ats/interviews/[id]/live/token (panel) and
 * app/api/ats/interviews/join (candidate).
 */
import type { MeetingProviderImpl } from './types'

export const livekitRoomName = (interviewId: string) => `ats-interview-${interviewId}`

export const livekitProvider: MeetingProviderImpl = {
  id: 'livekit',
  async createMeeting(ctx, input) {
    const room = `${ctx.origin}/dashboard/hiring/interviews/${encodeURIComponent(input.interviewId)}/live`
    return { join_url: room, meeting_id: livekitRoomName(input.interviewId), host_url: room }
  },
  async updateMeeting(ctx, _id, input) {
    return this.createMeeting(ctx, input)
  },
  async cancelMeeting() {
    // Nothing to tear down; the rotated token nonce stops the old candidate link.
  },
}
