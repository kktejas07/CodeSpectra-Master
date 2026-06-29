import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { integrations } from '@/lib/db/misc'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.redirect(new URL('/auth/login', _req.url))
  }

  const { id } = await params

  const providerRoutes: Record<string, string> = {
    github: '/api/integrations/github',
    slack: '/api/integrations/slack',
    sonarqube: '/api/integrations/sonarqube',
  }

  const target = providerRoutes[id]
  if (!target) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  }

  return NextResponse.redirect(new URL(target, _req.url))
}
