/**
 * W15-AUTO-06 drive no-shows (drive organisers only).
 *   GET  /api/live-drives/[id]/no-shows                    → { count, targets: [{ id, title, starts_at }] }
 *   POST /api/live-drives/[id]/no-shows { target_drive_id } → adds every no-show to that upcoming drive's roster
 * No-shows are marked by the "Drive-day reminders and no-shows" automation (or are rostered
 * candidates who never started once joining closed). The target must be a drive the same user
 * organises; the roster import re-checks that.
 */
import { z } from 'zod'
import { limitRequest } from '@/lib/rate-limit'
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { importRoster, loadForStaff } from '@/lib/live-drives/service'
import { candidatesCol, drivesCol } from '@/lib/live-drives/store'
import { driveClosedAt } from '@/lib/automation/nudges/rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({ target_drive_id: z.string().regex(ID_RE) }).strict()

async function noShowEmails(id: string, schedule: { start_at: string; duration_min: number; late_join_min?: number }): Promise<string[]> {
  if (Date.now() < driveClosedAt(schedule)) return []
  const rows = await (await candidatesCol()).find({ drive_id: id, state: 'not_started', started_at: null }, { projection: { _id: 0, email: 1 } }).limit(5000).toArray()
  return [...new Set(rows.map((r) => String(r.email || '').toLowerCase()).filter(Boolean))]
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('no-shows', async (user) => {
    const { drive, role } = await loadForStaff(user, id)
    if (role !== 'owner') return json({ error: 'Only the drive organisers can do this.', code: 'ld_owner_only' }, 403)
    const emails = await noShowEmails(id, drive.schedule)
    const targets = await (await drivesCol()).find({ 'owner.tenant_id': drive.owner.tenant_id, status: { $in: ['draft', 'scheduled'] }, 'schedule.start_at': { $gt: new Date().toISOString() }, id: { $ne: id } }, { projection: { _id: 0, id: 1, title: 1, 'schedule.start_at': 1 } }).sort({ 'schedule.start_at': 1 }).limit(20).toArray()
    return json({ count: emails.length, targets: targets.map((t) => ({ id: t.id, title: t.title, starts_at: t.schedule?.start_at ?? null })) })
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('no-shows reschedule', async (user) => {
    const limited = await limitRequest(req, 'live-drive-noshow', user.id, 20, 60 * 60_000)
    if (limited) return limited
    const p = Body.safeParse(await body(req, 10_000))
    if (!p.success || p.data.target_drive_id === id) return json({ error: 'Check the form and try again.', code: 'ld_invalid_input' }, 400)
    const { drive, role } = await loadForStaff(user, id)
    if (role !== 'owner') return json({ error: 'Only the drive organisers can do this.', code: 'ld_owner_only' }, 403)
    const emails = await noShowEmails(id, drive.schedule)
    if (!emails.length) return json({ added: 0, already: 0, missing_count: 0, total: 0 })
    return json(await importRoster(user, p.data.target_drive_id, { source: 'emails', emails }))
  })
}
