/**
 * LiveKit access tokens for interview rooms (ATS interviews and the legacy
 * app/api/interviews/[id]/live/token route).
 *
 * Config resolution, per field: Admin → Settings → Hiring integrations
 * (server secrets livekit_url / livekit_api_key / livekit_api_secret) → env
 * (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET) → the docker-compose dev
 * defaults outside production.
 */
import { AccessToken } from 'livekit-server-sdk'
import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import { livekitRoomName } from './providers/livekit'

export interface LivekitConfig { key: string; secret: string; url: string }

export const LIVEKIT_NOT_CONFIGURED =
  'Video is not configured. A platform admin can add the LiveKit URL, API key and secret in Admin → Settings → Hiring integrations.'

const DEV = { key: 'devkey', secret: 'dev-secret-match-compose', url: 'ws://localhost:7880' }

const clean = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && !isMaskedSecret(s) ? s : ''
}

/** Pure resolver (exported for tests). */
export function resolveLivekitConfig(
  secrets: Record<string, unknown>,
  env: Record<string, string | undefined>,
  isProd: boolean,
): LivekitConfig | null {
  const pick = (k: 'url' | 'key' | 'secret', sk: string, ek: string) =>
    clean(secrets[sk]) || clean(env[ek]) || (isProd ? '' : DEV[k])
  const url = pick('url', 'livekit_url', 'LIVEKIT_URL')
  const key = pick('key', 'livekit_api_key', 'LIVEKIT_API_KEY')
  const secret = pick('secret', 'livekit_api_secret', 'LIVEKIT_API_SECRET')
  return key && secret && url ? { key, secret, url } : null
}

export async function livekitConfig(): Promise<LivekitConfig | null> {
  const s = (await readServerSecrets().catch(() => ({}))) as Record<string, unknown>
  return resolveLivekitConfig(s, process.env, process.env.NODE_ENV === 'production')
}

/** Token for any room name with the given config. */
export async function mintLivekitToken(cfg: LivekitConfig, room: string, identity: string, name: string, ttlSec: number): Promise<string> {
  const at = new AccessToken(cfg.key, cfg.secret, { identity, name: name.slice(0, 100), ttl: ttlSec })
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })
  return at.toJwt()
}

export async function mintRoomToken(interviewId: string, identity: string, name: string, ttlSec = 3 * 3600): Promise<{ token: string; url: string } | null> {
  const cfg = await livekitConfig()
  if (!cfg) return null
  return { token: await mintLivekitToken(cfg, livekitRoomName(interviewId), identity, name, ttlSec), url: cfg.url }
}
