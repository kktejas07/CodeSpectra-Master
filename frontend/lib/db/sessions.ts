import { newId, nowIso } from './ids'
import { getMongoDb } from '@/lib/mongodb'

export interface UserSessionDoc {
  id: string
  user_id: string
  email: string
  ip: string
  user_agent: string
  browser: string
  os: string
  device: 'desktop' | 'mobile' | 'tablet'
  country: string | null
  city: string | null
  isp: string | null
  lat: number | null
  lon: number | null
  visitor_id?: string | null
  last_seen: string
  created_at: string
  is_active: boolean
}

export { newId, nowIso }

export function parseUserAgent(ua: string): { browser: string; os: string; device: 'desktop' | 'mobile' | 'tablet' } {
  let browser = 'Unknown'
  let os = 'Unknown'
  let device: 'desktop' | 'mobile' | 'tablet' = 'desktop'

  if (/Tablet|iPad/i.test(ua)) device = 'tablet'
  else if (/Mobile|Android|iPhone|iPod/i.test(ua)) device = 'mobile'

  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/)
    browser = m ? `Edge ${m[1]}` : 'Edge'
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    const m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/)
    browser = m ? `Chrome ${m[1]}` : 'Chrome'
  } else if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/)
    browser = m ? `Firefox ${m[1]}` : 'Firefox'
  } else if (/Safari\//i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/)
    browser = m ? `Safari ${m[1]}` : 'Safari'
  }

  if (/Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/)
    os = m ? `Windows ${m[1]}` : 'Windows'
  } else if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/)
    os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS'
  } else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/)
    os = m ? `Android ${m[1]}` : 'Android'
  } else if (/iPhone OS|iOS/i.test(ua)) {
    const m = ua.match(/iPhone OS ([\d_]+)/)
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS'
  } else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  return { browser, os, device }
}

async function resolveGeo(ip: string): Promise<{ country: string | null; city: string | null; isp: string | null; lat: number | null; lon: number | null }> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return { country: null, city: null, isp: null, lat: null, lon: null }
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,isp,lat,lon`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { country: null, city: null, isp: null, lat: null, lon: null }
    const data = await res.json()
    if (data.status === 'fail') return { country: null, city: null, isp: null, lat: null, lon: null }
    return { country: data.country ?? null, city: data.city ?? null, isp: data.isp ?? null, lat: data.lat ?? null, lon: data.lon ?? null }
  } catch {
    return { country: null, city: null, isp: null, lat: null, lon: null }
  }
}

export async function createUserSession(params: {
  user_id: string
  email: string
  ip: string
  user_agent: string
  visitor_id?: string
}): Promise<{ country: string | null }> {
  try {
    const parsed = parseUserAgent(params.user_agent)
    const geo = await resolveGeo(params.ip)
    const db = await getMongoDb()
    await db.collection<UserSessionDoc>('user_sessions').insertOne({
      id: newId(),
      user_id: params.user_id,
      email: params.email,
      ip: params.ip,
      user_agent: params.user_agent,
      ...parsed,
      ...geo,
      visitor_id: params.visitor_id || null,
      last_seen: nowIso(),
      created_at: nowIso(),
      is_active: true,
    })
    await db.collection('user_sessions').deleteMany({ user_id: params.user_id, created_at: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() } })
    return { country: geo.country }
  } catch (e) {
    console.error('[sessions] Failed to create session:', e)
    return { country: null }
  }
}

export async function updateSessionHeartbeat(userId: string, ip: string, userAgent: string, visitor_id?: string): Promise<number> {
  try {
    const parsed = parseUserAgent(userAgent)
    const db = await getMongoDb()
    const set: Record<string, unknown> = { last_seen: nowIso(), ...parsed }
    if (visitor_id) set.visitor_id = visitor_id
    const res = await db.collection<UserSessionDoc>('user_sessions').updateOne(
      { user_id: userId, ip, user_agent: userAgent, is_active: true },
      { $set: set },
    )
    return res.matchedCount
  } catch (e) {
    console.error('[sessions] Heartbeat update failed:', e)
    return 0
  }
}

export async function getActiveSessions(limit = 50): Promise<UserSessionDoc[]> {
  try {
    const db = await getMongoDb()
    return await db.collection<UserSessionDoc>('user_sessions')
      .find({ is_active: true })
      .sort({ last_seen: -1 })
      .limit(limit)
      .toArray()
  } catch {
    return []
  }
}

export async function getSessionStats(): Promise<{ totalToday: number; uniqueUsersToday: number; activeNow: number }> {
  try {
    const db = await getMongoDb()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const todayIso = todayStart.toISOString()
    const [totalToday, uniqueUsersToday, activeNow] = await Promise.all([
      db.collection('user_sessions').countDocuments({ created_at: { $gte: todayIso } }),
      db.collection('user_sessions').distinct('user_id', { created_at: { $gte: todayIso } }).then(r => r.length),
      db.collection('user_sessions').countDocuments({ last_seen: { $gte: fiveMinAgo } }),
    ])
    return { totalToday, uniqueUsersToday, activeNow }
  } catch {
    return { totalToday: 0, uniqueUsersToday: 0, activeNow: 0 }
  }
}
