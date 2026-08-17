/**
 * POST /api/analytics/events — Ingest batched analytics events.
 * GET  /api/admin/analytics/events — Query events (superadmin).
 *
 * Client sends:
 * { session_id, anonymous_id, user_id?, events: [{ event, path, timestamp, properties, device_type, browser, os, ... }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/route-auth'
import { analyticsEvents, analyticsSessions, newId, nowIso } from '@/lib/db/analytics'
import { sanitizeRegex } from '@/lib/sanitize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── POST: ingest events ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const gate = await requireAuth()
    if (!('error' in gate)) userId = gate.user.id
  } catch { /* anonymous analytics OK */ }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sessionId = (body.session_id as string) || ''
  const anonymousId = (body.anonymous_id as string) || ''
  const events = Array.isArray(body.events) ? body.events : []

  if (events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const now = nowIso()
  const ua = req.headers.get('user-agent') || ''
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''

  try {
    // Store events
    const col = await analyticsEvents()
    const docs = events.slice(0, 50).map((e: Record<string, unknown>) => ({
      id: newId(),
      event: String(e.event || 'unknown').slice(0, 128),
      user_id: userId || undefined,
      anonymous_id: anonymousId || undefined,
      session_id: sessionId || undefined,
      timestamp: String(e.timestamp || now),
      url: String(e.url || ''),
      path: String(e.path || ''),
      referrer: String(e.referrer || ''),
      country: undefined, // populated by geo-ip later
      device_type: String(e.device_type || 'desktop'),
      browser: String(e.browser || 'Unknown'),
      os: String(e.os || 'Unknown'),
      screen_width: Number(e.screen_width) || undefined,
      screen_height: Number(e.screen_height) || undefined,
      utm_source: String(e.utm_source || ''),
      utm_medium: String(e.utm_medium || ''),
      utm_campaign: String(e.utm_campaign || ''),
      properties: e.properties && typeof e.properties === 'object' ? e.properties : undefined,
    }))

    await col.insertMany(docs as any)

    // Update session
    if (sessionId) {
      try {
        const sessCol = await analyticsSessions()
        const existing = await sessCol.findOne({ id: sessionId })
        const device = events[0] as Record<string, unknown> || {}
        const pagePath = String((events.find((e: Record<string, unknown>) => e.event === 'page_view') as Record<string, unknown>)?.path || '')

        if (existing) {
          const pages = existing.pages || []
          if (pagePath && !pages.includes(pagePath)) pages.push(pagePath)
          await sessCol.updateOne(
            { id: sessionId },
            {
              $set: { last_activity_at: now, exit_page: pagePath || existing.exit_page },
              $inc: { events_count: events.length, pageviews: events.some((e: Record<string, unknown>) => e.event === 'page_view') ? 1 : 0 },
              $addToSet: { pages: { $each: pages.slice(-50) } },
            },
          )
        } else {
          await sessCol.insertOne({
            id: sessionId,
            user_id: userId || undefined,
            anonymous_id: anonymousId || undefined,
            started_at: now,
            last_activity_at: now,
            entry_page: pagePath,
            exit_page: pagePath,
            pageviews: events.filter((e: Record<string, unknown>) => e.event === 'page_view').length,
            events_count: events.length,
            device_type: String(device.device_type || 'desktop'),
            browser: String(device.browser || 'Unknown'),
            os: String(device.os || 'Unknown'),
            referrer: String(device.referrer || ''),
            utm_source: String(device.utm_source || ''),
            utm_medium: String(device.utm_medium || ''),
            utm_campaign: String(device.utm_campaign || ''),
            pages: pagePath ? [pagePath] : [],
          })
        }
      } catch (e) {
        console.error('[analytics] session update error:', e)
      }
    }

    return NextResponse.json({ ok: true, inserted: docs.length })
  } catch (e) {
    console.error('[analytics] events insert error:', e)
    return NextResponse.json({ ok: true, inserted: 0 })
  }
}

// ─── GET: query events (superadmin) ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000)
  const event = searchParams.get('event')
  const path = searchParams.get('path')
  const userId = searchParams.get('user_id')
  const since = searchParams.get('since') // ISO date string

  const filter: Record<string, unknown> = {}
  if (event) filter.event = event
  if (path) filter.path = { $regex: sanitizeRegex(path), $options: 'i' }
  if (userId) filter.user_id = userId
  if (since) filter.timestamp = { $gte: since }

  const col = await analyticsEvents()
  const events = await col.find(filter).sort({ timestamp: -1 }).limit(limit).toArray()
  const total = await col.countDocuments(filter)

  return NextResponse.json({ events, total, limit })
}
