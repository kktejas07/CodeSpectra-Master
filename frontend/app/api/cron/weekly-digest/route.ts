import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    if (process.env.NODE_ENV === 'production') return false
    return true
  }
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('secret') || ''
  const fromHeader = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return fromQuery === expected || fromHeader === expected
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getMongoDb()
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

    const [newUsers, newSubmissions, newHackathons, newCertifications] = await Promise.all([
      db.collection('users').countDocuments({ created_at: { $gte: weekAgo } }),
      db.collection('exam_submissions').countDocuments({ created_at: { $gte: weekAgo } }),
      db.collection('hackathons').countDocuments({ created_at: { $gte: weekAgo } }),
      db.collection('certifications').countDocuments({ created_at: { $gte: weekAgo } }),
    ])

    // Get subscribed users (users with newsletter preferences or all active users)
    const subscribers = await db.collection('users')
      .find({ newsletter_subscribed: { $ne: false } })
      .project({ email: 1, fullName: 1, name: 1 })
      .toArray()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'

    let sent = 0
    for (const user of subscribers) {
      if (!user.email) continue
      try {
        const name = user.fullName || user.name || 'there'
        await sendEmail(user.email, {
          subject: `CodeSpectra Weekly Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a1a2e;">Weekly Platform Digest</h2>
              <p>Hi ${name}, here's what happened on CodeSpectra this week:</p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 8px 0;"><strong>${newUsers}</strong> new users joined</p>
                <p style="margin: 8px 0;"><strong>${newSubmissions}</strong> new submissions</p>
                <p style="margin: 8px 0;"><strong>${newHackathons}</strong> new hackathons</p>
                <p style="margin: 8px 0;"><strong>${newCertifications}</strong> new certifications</p>
              </div>
              <a href="${appUrl}/dashboard" style="display: inline-block; background: #6c5ce7; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Dashboard</a>
            </div>
          `,
        }).catch(() => {})
        sent++
      } catch {
        // Continue with next subscriber
      }
    }

    return NextResponse.json({ sent })
  } catch (e) {
    console.error('[weekly-digest] error:', e)
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
