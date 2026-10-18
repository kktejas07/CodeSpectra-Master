/**
 * Email newly assigned hackathon judges (judgeAssignment template). Called by
 * lib/services/hackathons create/update, so the hackathon PATCH route and the
 * agent's create_hackathon / assign_judges tools behave the same. Only judges
 * that were not on the event before are emailed; a send failure never fails
 * the save.
 */
import 'server-only'
import { hackathonEmailTemplates } from '@/lib/email-templates'
import { sendEmail } from '@/lib/send-email'
import { escapeHtml } from '@/lib/safe-html'

/** Pure: judge ids in `next` that are not in `current` (deduped, order kept). */
export function addedJudges(next: readonly string[] | undefined, current: readonly string[] | undefined): string[] {
  const before = new Set(current ?? [])
  return [...new Set(next ?? [])].filter((j) => typeof j === 'string' && j && !before.has(j))
}

export async function emailNewJudges(
  event: { id: string; name: string; num_teams?: number; tasks?: unknown[] },
  judgeIds: readonly string[],
): Promise<{ sent: number; failed: number }> {
  const ids = [...new Set(judgeIds)].filter(Boolean)
  if (!ids.length) return { sent: 0, failed: 0 }
  let sent = 0
  let failed = 0
  try {
    const { users } = await import('@/lib/db/admin')
    const rows = await (await users())
      .find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids } }] } as Record<string, unknown>, { projection: { email: 1, name: 1 } })
      .toArray()
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const results = await Promise.allSettled(
      rows
        .filter((u) => typeof u.email === 'string' && u.email.includes('@'))
        .map((u) => {
          const template = hackathonEmailTemplates.judgeAssignment({
            eventName: escapeHtml(String(event.name || 'Hackathon')),
            judgeName: escapeHtml(String(u.name || u.email).slice(0, 120)),
            teamCount: Number(event.num_teams) || 0,
            problemCount: Array.isArray(event.tasks) ? event.tasks.length : 0,
            reviewUrl: `${base}/dashboard/judge`,
          })
          // Subject is plain text: use the raw (control-char-free) name there.
          const subject = `You've been assigned as a judge — ${String(event.name || 'Hackathon').replace(/[\r\n\t]+/g, ' ').slice(0, 150)}`
          return sendEmail(String(u.email), { ...template, subject })
        }),
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && (r.value as { success?: boolean } | undefined)?.success !== false) sent++
      else failed++
    }
  } catch (e) {
    console.error('[hackathons] judge emails failed:', e)
  }
  return { sent, failed }
}
