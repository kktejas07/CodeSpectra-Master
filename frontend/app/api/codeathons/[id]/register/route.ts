import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import {
  codeathons,
  codeathonRegistrations,
  newId,
  nowIso,
} from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'
import { codeathonWindow } from '@/lib/codeathon-run'
import { codeathonVisibleTo } from '@/lib/hackathons/tenant-scope'

export async function POST(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params
  try {
    const data = (await request.json().catch(() => ({}))) as { teamName?: string }

    // The codeathon must exist, be published, and not be over or full.
    const codeCol = await codeathons()
    const codeathon = await codeCol.findOne({ id }) as (Record<string, any> | null)
    if (!codeathon || !codeathonVisibleTo(gate.user, codeathon)) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (codeathonWindow(codeathon).ended) return NextResponse.json({ error: 'This codeathon has ended' }, { status: 409 })

    const regCol = await codeathonRegistrations()
    const existing = await regCol.findOne({ codeathon_id: id, user_id: gate.user.id })
    if (existing) {
      return NextResponse.json({
        success: true,
        registrationId: existing.id,
        codeathonId: id,
        registeredAt: existing.registered_at,
        alreadyRegistered: true,
      })
    }

    // Atomic capacity: only bump the counter while under maxParticipants.
    const max = Number(codeathon.maxParticipants ?? codeathon.max_participants) || 0
    const seat = await codeCol.updateOne(
      max > 0 ? { id, $or: [{ participants: { $lt: max } }, { participants: { $exists: false } }] } as Record<string, unknown> : { id },
      { $inc: { participants: 1 } },
    )
    if (seat.modifiedCount === 0) return NextResponse.json({ error: 'This codeathon is full' }, { status: 409 })

    const doc = {
      id: newId(),
      codeathon_id: id,
      user_id: gate.user.id,
      team_name: typeof data.teamName === 'string' ? data.teamName.slice(0, 80) : null,
      registered_at: nowIso(),
    }
    await regCol.insertOne(doc)
    void import('@/lib/automation/events').then(({ emit }) => emit('hackathon.registered', {
      event_id: id, event_kind: 'codeathon', event_name: codeathon.title ?? null, user_id: gate.user.id, team_name: doc.team_name, starts_at: codeathon.startDate ?? null,
    }, { tenantId: codeathon.tenant_id ?? null, idempotencyKey: `hackathon.registered:codeathon:${id}:${gate.user.id}` })).catch((e) => console.error('[automation] emit failed:', e))

    // Attendance XP (idempotent per registration).
    let xpAmount = 0
    try {
      const { awardXpWithLevelUp } = await import('@/lib/xp-service')
      const { getXpRewards } = await import('@/lib/db/leaderboard')
      const rewards = await getXpRewards()
      xpAmount = Number(rewards.codeathon) || 0
      await awardXpWithLevelUp({
        userId: gate.user.id,
        amount: rewards.codeathon,
        reason: 'codeathon_attended',
        submissionId: doc.id,
        metadata: { codeathon_id: id },
      })
    } catch (e) {
      console.error('[CodeSpectra] codeathon XP award failed:', e)
    }

    if (xpAmount > 0) try {
      const title = codeathon.title || 'the codeathon'
      const { notify } = await import('@/lib/notifications')
      await notify({
        user_id: gate.user.id,
        type: 'xp.awarded',
        title: 'Registered',
        message: `You earned ${xpAmount} XP for registering for ${title}`,
        title_i18n: { key: 'xp.registered.title' },
        message_i18n: { key: 'xp.registered.message', params: { amount: xpAmount, title } },
        link: `/dashboard/codeathons/${id}`,
        icon: 'star',
      })
    } catch { /* notification best-effort */ }

    return NextResponse.json({
      success: true,
      registrationId: doc.id,
      codeathonId: id,
      registeredAt: doc.registered_at,
    })
  } catch (error) {
    console.error('[CodeSpectra] codeathon register:', error)
    return NextResponse.json({ error: 'Failed to register for codeathon' }, { status: 400 })
  }
}
