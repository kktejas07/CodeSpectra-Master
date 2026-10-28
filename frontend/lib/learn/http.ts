/** Route helpers for /api/learn/** (server only). */
import { NextResponse } from 'next/server'
import { requireSuperAdmin, type APIUser } from '@/lib/route-auth'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

/** Learn admin = platform superadmin (the hub is platform-wide public content). */
export async function learnAdmin(): Promise<{ user: APIUser } | { res: NextResponse }> {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return { res: NextResponse.json({ error: gate.error }, { status: gate.status }) }
  return { user: gate.user }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? sanitizeMongoInput(body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status })
}

export function serverError(tag: string, e: unknown): NextResponse {
  console.error(`[learn] ${tag}:`, (e as Error)?.message)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}
