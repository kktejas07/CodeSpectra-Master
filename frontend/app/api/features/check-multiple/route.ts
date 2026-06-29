import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const namesParam = searchParams.get('names')
  if (!namesParam) {
    return NextResponse.json({ error: 'Feature names required' }, { status: 400 })
  }
  const user = await getAPIUser()
  const names = namesParam.split(',').map(s => s.trim()).filter(Boolean)
  const flags: Record<string, boolean> = {}
  for (const name of names) {
    flags[name] = Boolean(user)
  }
  return NextResponse.json({ flags })
}
