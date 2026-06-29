import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'

export async function GET() {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({ user })
}
