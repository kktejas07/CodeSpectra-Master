/**
 * LiveKit access tokens for ATS interview rooms (same env as
 * app/api/interviews/[id]/live/token: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).
 */
import { AccessToken } from 'livekit-server-sdk'
import { livekitRoomName } from './providers/livekit'

const isProd = () => process.env.NODE_ENV === 'production'

export function livekitConfig(): { key: string; secret: string; url: string } | null {
  const key = process.env.LIVEKIT_API_KEY || (isProd() ? '' : 'devkey')
  const secret = process.env.LIVEKIT_API_SECRET || (isProd() ? '' : 'dev-secret-match-compose')
  const url = process.env.LIVEKIT_URL || (isProd() ? '' : 'ws://localhost:7880')
  return key && secret && url ? { key, secret, url } : null
}

export async function mintRoomToken(interviewId: string, identity: string, name: string, ttlSec = 3 * 3600): Promise<{ token: string; url: string } | null> {
  const cfg = livekitConfig()
  if (!cfg) return null
  const at = new AccessToken(cfg.key, cfg.secret, { identity, name: name.slice(0, 100), ttl: ttlSec })
  at.addGrant({ roomJoin: true, room: livekitRoomName(interviewId), canPublish: true, canSubscribe: true })
  return { token: await at.toJwt(), url: cfg.url }
}
