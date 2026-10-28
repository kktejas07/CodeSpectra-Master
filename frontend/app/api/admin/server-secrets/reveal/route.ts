import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { readServerSecrets, type ServerSecretsRecord } from '@/lib/server-secrets-cache'
import { SECRET_FIELDS } from '@/lib/server-secrets-fields'

export async function GET(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key') as keyof ServerSecretsRecord | null
  if (!key) {
    return NextResponse.json({ error: 'Missing key param' }, { status: 400 })
  }
  if (!SECRET_FIELDS.includes(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }
  const raw = await readServerSecrets()
  return NextResponse.json({ value: raw[key] ?? null })
}