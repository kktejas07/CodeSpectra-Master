/**
 * XP award + level-up pipeline.
 *
 * `awardXpWithLevelUp` wraps the low-level `awardXp` log insert with:
 *   1. a real-time "you gained XP" notification (in-app + FCM push),
 *   2. level-up detection (via `xpToLevel`, the same formula the leaderboard
 *      page shows users),
 *   3. automatic issuance of a verifiable "Level N" certificate + email.
 *
 * Everything degrades gracefully — XP is already stored by `awardXp`, so any
 * notification/certificate failure can't lose points.
 */
import { certificationAttempts, newAttemptId, newAttemptToken } from '@/lib/db/certifications'
import { awardXp, getUserXp, type XpReason } from '@/lib/db/leaderboard'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { getMongoDb } from '@/lib/mongodb'
import { notify } from '@/lib/notifications'
import type { Document, Filter } from 'mongodb'

export interface AwardXpArgs {
  userId: string
  amount: number
  reason: XpReason
  problemId?: string | null
  submissionId?: string | null
  metadata?: Record<string, unknown>
  /** Skip notifications + level-up certificate (raw award only). */
  quiet?: boolean
}

export interface AwardXpResult {
  xpEventId: string | null
  xp: number
  level: number
  leveledUp: boolean
}

export async function awardXpWithLevelUp(args: AwardXpArgs): Promise<AwardXpResult> {
  const { userId, amount, reason } = args
  if (amount <= 0) return { xpEventId: null, xp: await getUserXp(userId), level: xpToLevel(await getUserXp(userId)), leveledUp: false }

  const before = await getUserXp(userId)
  const beforeLevel = xpToLevel(before)

  const xpEventId = await awardXp({
    userId,
    amount,
    reason,
    problemId: args.problemId ?? null,
    submissionId: args.submissionId ?? null,
    metadata: args.metadata ?? {},
  })

  if (!xpEventId) {
    // Duplicate award (idempotency guard) — no new XP, no level change.
    return { xpEventId: null, xp: before, level: beforeLevel, leveledUp: false }
  }

  const xp = before + amount
  const level = xpToLevel(xp)
  const leveledUp = level > beforeLevel

  if (!args.quiet) {
    await notify({
      user_id: userId,
      type: 'xp.awarded',
      title: `You gained ${amount} XP!`,
      message: `Keep up the great work — ${amount} XP added to your profile.`,
      link: '/dashboard/leaderboard',
      icon: 'star',
      metadata: { xp: String(amount), level: String(level), reason },
    })
  }

  if (leveledUp && !args.quiet) {
    await issueLevelUpCertificate(userId, level, xp)
  }

  return { xpEventId, xp, level, leveledUp }
}

/**
 * Create a verifiable "Level N Achieved" certificate in the shared
 * `certification_attempts` collection so it reuses the public verify page,
 * SVG download, and certificate templates. Returns the verify token/URL.
 */
export async function issueLevelUpCertificate(
  userId: string,
  newLevel: number,
  totalXp: number,
): Promise<{ verifyToken: string; verifyUrl: string; newLevel: number } | null> {
  try {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne(
      { $or: [{ id: userId }, { _id: userId }] } as Filter<Document>,
      { projection: { name: 1, fullName: 1, email: 1 } },
    )
    const name = String(user?.fullName || user?.name || 'CodeSpectra User')
    const email = String(user?.email || '')

    const now = new Date().toISOString()
    const verifyToken = newAttemptToken()

    const attempts = await certificationAttempts()
    await attempts.insertOne({
      id: newAttemptId(),
      user_id: userId,
      certification_id: `level-${newLevel}`,
      verify_token: verifyToken,
      started_at: now,
      submitted_at: now,
      score: totalXp,
      passed: true,
      score_label: `+${totalXp} XP earned`,
      snapshot: { name },
      cert_snapshot: { title: `Level ${newLevel} Achieved`, level: String(newLevel), source: 'CodeSpectra XP' },
    })

    const link = `/cert/verify/${verifyToken}`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyUrl = `${baseUrl}${link}`

    // In-app + push level-up celebration.
    await notify({
      user_id: userId,
      type: 'xp.level_up',
      title: `Congratulations! You reached Level ${newLevel}`,
      message: `You leveled up! View and download your Level ${newLevel} certificate.`,
      link,
      icon: 'trophy',
      metadata: { xp: String(totalXp), newLevel: String(newLevel), verify_token: verifyToken },
    })

    await notify({
      user_id: userId,
      type: 'certificate.issued',
      title: `Level ${newLevel} Certificate Issued`,
      message: 'Your level-up certificate is ready to view and download.',
      link,
      icon: 'award',
      metadata: { verify_token: verifyToken },
    })

    // Branded level-up email.
    if (email) {
      try {
        const { sendEmail } = await import('@/lib/send-email')
        const { emailTemplates } = await import('@/lib/email-templates')
        const tpl = emailTemplates.levelUp({ name, newLevel, totalXp, certUrl: link })
        await sendEmail(email, tpl)
      } catch { /* email is optional */ }
    }

    return { verifyToken, verifyUrl, newLevel }
  } catch (e) {
    console.error('[xp-service] issueLevelUpCertificate failed:', e)
    return null
  }
}
