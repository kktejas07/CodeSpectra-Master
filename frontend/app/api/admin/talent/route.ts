import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { talentSettingsSchema } from '@/lib/talent/core'
import { getTalentSettings, listReports, saveTalentSettings } from '@/lib/talent/db'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** GET /api/admin/talent — talent-search settings (caps, on/off) and learner reports about recruiters. */
export async function GET() {
  const a = await requireSuperAdmin()
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const [settings, reports] = await Promise.all([getTalentSettings(), listReports(200)])
    return NextResponse.json({ settings, reports }, { headers: NO_STORE })
  } catch (e) {
    console.error('[admin/talent] GET failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Couldn’t load talent settings.' }, { status: 500 })
  }
}

/** PATCH /api/admin/talent — change caps or turn talent search off. */
export async function PATCH(req: NextRequest) {
  const a = await requireSuperAdmin()
  if ('error' in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = talentSettingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.')}: ${i.message}` : 'Invalid settings' }, { status: 400 })
  }
  try {
    const settings = await saveTalentSettings(parsed.data, a.user.id)
    await auditAdmin(a.user, 'talent.settings_update', 'talent_settings', 'global', JSON.stringify(parsed.data))
    return NextResponse.json({ settings }, { headers: NO_STORE })
  } catch (e) {
    console.error('[admin/talent] PATCH failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Couldn’t save talent settings.' }, { status: 500 })
  }
}
