/** Manual link: the recruiter pastes any https meeting URL. Nothing is called. */
import { safeHttpUrl } from '@/lib/safe-html'
import { ProviderError, type MeetingProviderImpl } from './types'

export function validManualUrl(raw: unknown): string | null {
  const u = safeHttpUrl(raw)
  return u && u.startsWith('https://') && u.length <= 1000 ? u : null
}

export const manualProvider: MeetingProviderImpl = {
  id: 'manual',
  async createMeeting(_ctx, input) {
    const url = validManualUrl(input.manualUrl)
    if (!url) throw new ProviderError('manual', 'Paste the meeting link (it must start with https://).', 'config')
    return { join_url: url, meeting_id: `manual-${input.interviewId}`, host_url: url }
  },
  async updateMeeting(ctx, _id, input) {
    return this.createMeeting(ctx, input)
  },
  async cancelMeeting() {},
}
