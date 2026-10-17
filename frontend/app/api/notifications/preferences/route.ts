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

type Channel = (typeof DEFAULT_PREFERENCES)[number]

/**
 * Always returns the three channels, with anything the user saved merged over
 * the defaults. Stored docs are keyed by { user_id, type } (older docs used a
 * fixed `_id` such as 'email', so fall back to that).
 */
export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const col = await notificationPreferences()
    const stored = (await col.find({ user_id: user.id }).toArray()) as unknown as Array<Record<string, unknown>>
    const byType = new Map<string, Record<string, unknown>>()
    for (const doc of stored) {
      if (typeof doc.type === 'string') byType.set(doc.type, doc)
    }
    for (const doc of stored) {
      const legacy = typeof doc.type !== 'string' ? String(doc._id ?? '') : ''
      if (legacy && !byType.has(legacy)) byType.set(legacy, doc)
    }

    const merged: Channel[] = DEFAULT_PREFERENCES.map((d) => {
      const doc = byType.get(d.type)
      if (!doc) return d
      const cats = (doc.categories && typeof doc.categories === 'object' ? doc.categories : {}) as Record<string, unknown>
      const categories = { ...d.categories }
      for (const k of Object.keys(categories) as Array<keyof typeof categories>) {
        if (typeof cats[k] === 'boolean') categories[k] = cats[k] as boolean
      }
      return {
        ...d,
        enabled: typeof doc.enabled === 'boolean' ? doc.enabled : d.enabled,
        categories,
      }
    })
    return NextResponse.json(merged)
  } catch (error) {
    console.error('[CodeSpectra] Preferences fetch error:', error)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }
}
