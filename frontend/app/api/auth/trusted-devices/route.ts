import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { listTrustedDevices, removeAllTrustedDevices, removeTrustedDevice } from '@/lib/trusted-devices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/auth/trusted-devices — the signed-in user's trusted devices. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ devices: await listTrustedDevices(user.id) })
  } catch (e) {
    console.error('[trusted-devices] list failed:', e)
    return NextResponse.json({ error: 'Couldn’t load your devices.', code: 'auth_devices_load_failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/auth/trusted-devices — body { id } removes one device,
 * { all: true } removes every device. Face sign-in on a removed device
 * needs an emailed code again.
 */
export async function DELETE(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; all?: unknown }
  try {
    if (body.all === true) {
      const removed = await removeAllTrustedDevices(user.id)
      await writeAuditLog({ action: 'auth.trusted_devices.remove_all', outcome: 'success', actor: user.email, actorIp: clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, ''), resource: 'user/' + user.id, resourceType: 'auth', severity: 'info', user_id: user.id, detail: `${removed} removed` }).catch(() => {})
      return NextResponse.json({ ok: true, removed })
    }
    if (typeof body.id !== 'string' || !body.id || body.id.length > 64) {
      return NextResponse.json({ error: 'Choose a device to remove.', code: 'auth_choose_device' }, { status: 400 })
    }
    const ok = await removeTrustedDevice(user.id, body.id)
    if (!ok) return NextResponse.json({ error: 'That device isn’t on your list.', code: 'auth_device_unknown' }, { status: 404 })
    await writeAuditLog({ action: 'auth.trusted_devices.remove', outcome: 'success', actor: user.email, actorIp: clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, ''), resource: 'user/' + user.id, resourceType: 'auth', severity: 'info', user_id: user.id }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[trusted-devices] remove failed:', e)
    return NextResponse.json({ error: 'Couldn’t remove the device.', code: 'auth_device_remove_failed' }, { status: 500 })
  }
}
