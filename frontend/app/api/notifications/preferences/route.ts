import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { notificationPreferences } from '@/lib/db/admin'

const DEFAULT_PREFERENCES = [
  {
    id: 'email',
    type: 'email',
    enabled: true,
    categories: {
      support: true,
      billing: true,
      integrations: true,
      security: true,
      updates: false,
    },
  },
  {
    id: 'in_app',
    type: 'in_app',
    enabled: true,
    categories: {
      support: true,
      billing: true,
      integrations: true,
      security: true,
      updates: true,
    },
  },
  {
    id: 'slack',
    type: 'slack',
    enabled: false,
    categories: {
      support: false,
      billing: false,
      integrations: false,
      security: false,
      updates: false,
    },
  },
]

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const col = await notificationPreferences()
    const prefs = await col.find({ user_id: user.id }).toArray()

    if (prefs.length === 0) {
      return NextResponse.json(DEFAULT_PREFERENCES)
    }
    return NextResponse.json(prefs)
  } catch (error) {
    console.error('[CodeSpectra] Preferences fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
