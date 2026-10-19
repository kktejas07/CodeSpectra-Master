/**
 * AU-09 / A-051 — hackathon and codeathon reminders: 24 h and 1 h before the
 * start, and 24 h and 1 h before submissions close. Email + in-app for every
 * registered participant (WhatsApp too when they agreed and a template is
 * set), plus a `hackathon.starting` event for workflows. Each person gets
 * each reminder once (ledger), so a big event resumes on the next tick.
 */
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { emit } from '../events'
import { sendAutomationEmail } from '../mailer'
import { claimOnce } from '../store'
import { configValue, getSystemSettings } from '../settings'
import { hoursLeftLabel, reminderWindow } from './rules'
import type { SystemAutomation } from './types'

type Doc = Record<string, unknown>

interface Moment {
  kind: 'hackathon' | 'codeathon'
  id: string
  name: string
  tenantId: string | null
  phase: 'start' | 'submission_close'
  at: string
  window: '24h' | '1h'
  url: string
  userIds: () => Promise<string[]>
}

async function collectMoments(now: Date): Promise<Moment[]> {
  const db = await getMongoDb()
  const lo = now.toISOString()
  const hi = new Date(now.getTime() + 24 * 3_600_000).toISOString()
  const origin = getAppOrigin()
  const out: Moment[] = []
  const hks = (await db.collection('hackathons').find({ status: { $in: ['open', 'live'] }, $or: [{ starts_at: { $gt: lo, $lte: hi } }, { ends_at: { $gt: lo, $lte: hi } }] }, { projection: { _id: 0, id: 1, name: 1, slug: 1, starts_at: 1, ends_at: 1, tenant_id: 1 } }).limit(200).toArray()) as Doc[]
  for (const h of hks) {
    const userIds = async () => {
      const teams = (await db.collection('hackathon_teams').find({ hackathon_id: h.id }, { projection: { members: 1 } }).limit(5000).toArray()) as Doc[]
      return [...new Set(teams.flatMap((t) => ((t.members || []) as { user_id?: string }[]).map((m) => m.user_id).filter((x): x is string => !!x)))]
    }
    for (const [phase, at] of [['start', h.starts_at], ['submission_close', h.ends_at]] as const) {
      const win = reminderWindow(at as string, now)
      if (win) out.push({ kind: 'hackathon', id: String(h.id), name: String(h.name || 'Hackathon'), tenantId: (h.tenant_id as string) ?? null, phase, at: String(at), window: win, url: `${origin}/hackathons/${String(h.slug || h.id)}`, userIds })
    }
  }
  const cds = (await db.collection('codeathons').find({ status: { $nin: ['draft', 'completed', 'archived'] }, $or: [{ startDate: { $gt: lo, $lte: hi } }, { endDate: { $gt: lo, $lte: hi } }] }, { projection: { _id: 0, id: 1, title: 1, startDate: 1, endDate: 1, tenant_id: 1 } }).limit(200).toArray()) as Doc[]
  for (const c of cds) {
    const userIds = async () => {
      const regs = (await db.collection('codeathon_registrations').find({ codeathon_id: c.id }, { projection: { user_id: 1 } }).limit(20000).toArray()) as Doc[]
      return [...new Set(regs.map((r) => String(r.user_id || '')).filter(Boolean))]
    }
    for (const [phase, at] of [['start', c.startDate], ['submission_close', c.endDate]] as const) {
      const iso = at ? new Date(String(at)).toISOString() : null
      const win = reminderWindow(iso, now)
      if (win && iso) out.push({ kind: 'codeathon', id: String(c.id), name: String(c.title || 'Codeathon'), tenantId: (c.tenant_id as string) ?? null, phase, at: iso, window: win, url: `${origin}/dashboard/codeathons/${String(c.id)}`, userIds })
    }
  }
  return out
}

export async function runEventReminders(now = new Date(), budgetMs = 40_000): Promise<{ moments: number; reminders: number }> {
  const started = Date.now()
  const db = await getMongoDb()
  const settings = await getSystemSettings()
  const moments = await collectMoments(now)
  let reminders = 0
  const { notify } = await import('@/lib/notifications')
  for (const m of moments) {
    const users = await m.userIds()
    const left = hoursLeftLabel(m.at, now)
    void emit('hackathon.starting', { event_id: m.id, event_kind: m.kind, event_name: m.name, phase: m.phase, hours_left: Math.max(1, Math.round((Date.parse(m.at) - now.getTime()) / 3_600_000)), at: m.at, url: m.url, participants: users.length }, { tenantId: m.tenantId, idempotencyKey: `hackathon.starting:${m.kind}:${m.id}:${m.phase}:${m.at}:${m.window}` })
    for (const uid of users) {
      if (Date.now() - started > budgetMs) return { moments: moments.length, reminders }
      if (!(await claimOnce(`evrem:${m.kind}:${m.id}:${m.phase}:${m.at}:${m.window}:${uid}`))) continue
      const starting = m.phase === 'start'
      const title = starting ? `${m.name} starts in ${left}` : `${m.name}: submissions close in ${left}`
      await notify({ user_id: uid, type: starting ? 'hackathon.started' : 'hackathon.ending_soon', title, message: starting ? 'Get your team ready.' : 'Submit your work before the deadline.', link: m.url.replace(getAppOrigin(), ''), icon: 'clock', skip_push: m.window === '24h' })
      const u = (await db.collection('user').findOne({ id: uid }, { projection: { email: 1, name: 1, fullName: 1 } })) as Doc | null
      if (u?.email) {
        await sendAutomationEmail({
          to: String(u.email), userId: uid, category: 'events', urgent: m.window === '1h',
          subject: title,
          heading: starting ? `${m.name} is almost here` : `Last call for ${m.name}`,
          bodyText: starting
            ? `Hi ${String(u.fullName || u.name || 'there')},\n\n${m.name} starts in ${left} (${new Date(m.at).toUTCString().replace(':00 GMT', ' UTC')}). Make sure your team is ready.`
            : `Hi ${String(u.fullName || u.name || 'there')},\n\nSubmissions for ${m.name} close in ${left}. Submit what you have — you can still improve it until the deadline.`,
          cta: { label: starting ? 'Open the event' : 'Submit now', url: m.url },
          reason: `You got this email because you registered for ${m.name}.`,
        })
      }
      if (m.window === '1h' && settings.config.wa_template_event) {
        const { whatsappRecipientForUser, sendWhatsAppTemplate } = await import('../whatsapp')
        await sendWhatsAppTemplate(await whatsappRecipientForUser(uid), { name: settings.config.wa_template_event, language: configValue(settings.config, 'wa_template_language'), params: [m.name, left] }, { userId: uid }).catch(() => null)
      }
      reminders++
    }
  }
  return { moments: moments.length, reminders }
}

export const EVENT_AUTOMATIONS: SystemAutomation[] = [
  {
    id: 'event-reminders',
    title: 'Hackathon and codeathon reminders',
    description: 'Every registered participant gets an email and in-app reminder 24 hours and 1 hour before an event starts and before submissions close (WhatsApp at 1 hour if they agreed and an event template is set).',
    group: 'Events',
    refs: ['AU-09', 'A-051'],
    cadence: { kind: 'interval', minutes: 10 },
    run: async (now) => runEventReminders(now),
  },
]
