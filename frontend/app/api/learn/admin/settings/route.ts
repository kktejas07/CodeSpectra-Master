/** /api/learn/admin/settings — GET / PUT generator settings (superadmin). */
import { NextRequest, NextResponse } from 'next/server'
import { cleanSettingsPatch, getLearnSettings, updateLearnSettings } from '@/lib/learn/store'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    return NextResponse.json({ settings: await getLearnSettings() })
  } catch (e) {
    return serverError('settings get', e)
  }
}

export async function PUT(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const { patch, error } = cleanSettingsPatch(await readJson(req))
    if (error) return fail(error)
    return NextResponse.json({ settings: await updateLearnSettings(patch, g.user.id) })
  } catch (e) {
    return serverError('settings put', e)
  }
}
