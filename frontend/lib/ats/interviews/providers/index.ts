import type { MeetingProvider } from '@/lib/ats/contract'
import { googleMeetProvider } from './google-meet'
import { livekitProvider } from './livekit'
import { manualProvider } from './manual'
import { teamsProvider } from './teams'
import { zoomProvider } from './zoom'
import type { MeetingProviderImpl } from './types'

export * from './types'

const PROVIDERS: Record<MeetingProvider, MeetingProviderImpl> = {
  livekit: livekitProvider,
  zoom: zoomProvider,
  google_meet: googleMeetProvider,
  teams: teamsProvider,
  manual: manualProvider,
}

export const MEETING_PROVIDERS = Object.keys(PROVIDERS) as MeetingProvider[]

export function getMeetingProvider(id: MeetingProvider): MeetingProviderImpl {
  return PROVIDERS[id]
}

export function isMeetingProvider(v: unknown): v is MeetingProvider {
  return typeof v === 'string' && v in PROVIDERS
}
