import { NextResponse } from 'next/server'
import { fetchRuntimes } from '@/lib/piston'

export const dynamic = 'force-dynamic'
export const revalidate = 300

export async function GET() {
  try {
    const runtimes = await fetchRuntimes()
    return NextResponse.json({ runtimes })
  } catch {
    return NextResponse.json({ runtimes: [] })
  }
}
