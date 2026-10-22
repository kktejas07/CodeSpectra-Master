/** GET — public forum categories (general, company exams, courses). */
import type { NextRequest } from 'next/server'
import { errorResponse, json } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const { listCategories } = await import('@/lib/community/service')
    return json({ categories: await listCategories() })
  } catch (e) { return errorResponse(e, 'community categories') }
}
