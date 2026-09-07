import { NextResponse } from 'next/server'
import { listFeedback } from '@/lib/db/feedback'
import { requireSuperAdmin } from '@/lib/route-auth'

export async function GET(req: Request) {
  try {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    
    const query: any = {}
    if (status) query.status = status

    const feedback = await listFeedback(query)
    
    return NextResponse.json(feedback)
  } catch (error: any) {
    console.error('Failed to list feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
