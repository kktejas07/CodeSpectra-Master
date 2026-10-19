import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json } from '@/lib/marketplace/seller-api'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const { getSettings, CATEGORIES } = await import('@/lib/marketplace/settings')
    return json({ settings: await getSettings(), categories: CATEGORIES })
  } catch (e) {
    return errorResponse(e, 'settings get')
  }
}

export async function PUT(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { saveSettings, validateSettings } = await import('@/lib/marketplace/settings')
    const v = validateSettings(await bodyOf(req))
    if (!v.ok) return json({ error: v.errors.join(' ') }, 400)
    return json({ settings: await saveSettings(v.value, g.user.id) })
  } catch (e) {
    return errorResponse(e, 'settings save')
  }
}
