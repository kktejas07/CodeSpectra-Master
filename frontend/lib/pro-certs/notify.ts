/**
 * Certification messages: in-app notification + email through lib/notifications
 * (recipient's language from lib/i18n/messages/<locale>/notify.json, the
 * user's email preferences, quiet hours and the unsubscribe footer).
 */
import 'server-only'
import { notify } from '@/lib/notifications'
import type { AttemptDoc, CredentialDoc, ProgramDoc } from './types'

const day = (iso: string) => iso.slice(0, 10)

export async function notifyCredentialIssued(c: CredentialDoc): Promise<void> {
  await notify({
    user_id: c.user_id,
    type: 'pro_cert.issued',
    title: `You're certified: ${c.program_title}`,
    message: `Your credential ${c.id} is valid until ${day(c.expires_at)}. Add it to LinkedIn from your certification page.`,
    title_i18n: { key: 'proCert.issued.title', params: { title: c.program_title } },
    message_i18n: { key: 'proCert.issued.message', params: { id: c.id, date: day(c.expires_at) } },
    link: `/dashboard/certifications/proctored/${encodeURIComponent(c.program_slug)}`,
    icon: 'award',
    send_email: true,
  })
}

export async function notifyAttemptOutcome(a: AttemptDoc, p: ProgramDoc, status: 'failed' | 'in_review' | 'rejected'): Promise<void> {
  const key = status === 'failed' ? 'proCert.failed' : status === 'in_review' ? 'proCert.inReview' : 'proCert.rejected'
  const english = {
    failed: { title: `${p.title}: not passed this time`, message: `You scored ${Math.round(a.score_pct ?? 0)}%. The pass mark is ${p.blueprint.pass_percent}%. You can try again after the waiting period.` },
    in_review: { title: `${p.title}: result under review`, message: 'A reviewer checks every proctored pass before the credential is issued. We will let you know soon.' },
    rejected: { title: `${p.title}: attempt not accepted`, message: 'After reviewing the proctoring record, this attempt could not be accepted. You can try again after the waiting period.' },
  }[status]
  await notify({
    user_id: a.user_id,
    type: `pro_cert.${status}`,
    ...english,
    title_i18n: { key: `${key}.title`, params: { title: p.title } },
    message_i18n: { key: `${key}.message`, params: { score: Math.round(a.score_pct ?? 0), pass: p.blueprint.pass_percent } },
    link: `/dashboard/certifications/proctored/${encodeURIComponent(p.slug)}`,
    icon: 'award',
    send_email: true,
  })
}

export async function notifyExpirySoon(c: CredentialDoc): Promise<void> {
  await notify({
    user_id: c.user_id,
    type: 'pro_cert.expiring',
    title: `${c.program_title} expires on ${day(c.expires_at)}`,
    message: 'Renew it by passing the current exam before it lapses — your new credential continues from the old expiry date.',
    title_i18n: { key: 'proCert.expiring.title', params: { title: c.program_title, date: day(c.expires_at) } },
    message_i18n: { key: 'proCert.expiring.message' },
    link: `/dashboard/certifications/proctored/${encodeURIComponent(c.program_slug)}`,
    icon: 'award',
    send_email: true,
  })
}

/** Purge the learner's public passport cache (credentials changed). Never throws. */
export async function revalidatePassportForUser(userId: string): Promise<void> {
  try {
    const { passports } = await import('@/lib/passport/db')
    const p = await (await passports()).findOne({ user_id: userId }, { projection: { _id: 0, handle: 1 } })
    if (!p) return
    const { revalidatePassport } = await import('@/lib/cache/passport')
    await revalidatePassport(p.handle)
  } catch {
    /* best effort */
  }
}
