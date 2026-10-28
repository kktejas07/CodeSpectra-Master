/**
 * Events feed settings (Admin → Events feed → Settings). Run markers
 * (last_pull_at …) live on the same doc and are claimed atomically so only one
 * replica runs each job.
 */
export interface EventsFeedSettings {
  pull_interval_hours: number
  /** Digest: 0 = Sunday … 6 = Saturday, local hour in digest_timezone. */
  digest_day: number
  digest_hour: number
  digest_timezone: string
  digest_enabled: boolean
  alerts_enabled: boolean
  reminders_enabled: boolean
  ai_summaries_enabled: boolean
  /** Approved Meta templates (names as approved in WhatsApp Manager). */
  whatsapp_template_alert: string
  whatsapp_template_reminder: string
  /** Weekly "hackathons this week" WhatsApp for people who chose weekly ({{1}} = summary, {{2}} = link). */
  whatsapp_template_digest: string
  /** Message templates (plain text; {placeholders} listed in the admin UI). */
  digest_subject: string
  digest_intro: string
  alert_subject: string
  reminder_subject: string
}

export interface EventsFeedSettingsDoc extends EventsFeedSettings {
  id: 'default'
  last_pull_at?: string | null
  last_alert_at?: string | null
  last_digest_week?: string | null
  updated_at?: string
}

export const EVENTS_FEED_DEFAULTS: EventsFeedSettings = {
  pull_interval_hours: 6,
  digest_day: 1,
  digest_hour: 9,
  digest_timezone: 'Asia/Kolkata',
  digest_enabled: true,
  alerts_enabled: true,
  reminders_enabled: true,
  ai_summaries_enabled: true,
  whatsapp_template_alert: '',
  whatsapp_template_reminder: '',
  whatsapp_template_digest: '',
  digest_subject: 'This week’s hackathons and coding events',
  digest_intro: 'Here are new and closing-soon events that match your choices.',
  alert_subject: 'New event: {title}',
  reminder_subject: 'Registration closes soon: {title}',
}

const tpl = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 120) : '')
const text = (v: unknown, d: string, n = 200) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : d)
const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d }
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

export function normalizeEventsFeedSettings(o: Record<string, unknown>): EventsFeedSettings {
  const D = EVENTS_FEED_DEFAULTS
  let tz = D.digest_timezone
  if (typeof o.digest_timezone === 'string') { try { new Intl.DateTimeFormat('en-US', { timeZone: o.digest_timezone }); tz = o.digest_timezone } catch { /* keep default */ } }
  return {
    pull_interval_hours: int(o.pull_interval_hours, 1, 72, D.pull_interval_hours),
    digest_day: int(o.digest_day, 0, 6, D.digest_day),
    digest_hour: int(o.digest_hour, 0, 23, D.digest_hour),
    digest_timezone: tz,
    digest_enabled: bool(o.digest_enabled, D.digest_enabled),
    alerts_enabled: bool(o.alerts_enabled, D.alerts_enabled),
    reminders_enabled: bool(o.reminders_enabled, D.reminders_enabled),
    ai_summaries_enabled: bool(o.ai_summaries_enabled, D.ai_summaries_enabled),
    whatsapp_template_alert: tpl(o.whatsapp_template_alert),
    whatsapp_template_reminder: tpl(o.whatsapp_template_reminder),
    whatsapp_template_digest: tpl(o.whatsapp_template_digest),
    digest_subject: text(o.digest_subject, D.digest_subject, 150),
    digest_intro: text(o.digest_intro, D.digest_intro, 600),
    alert_subject: text(o.alert_subject, D.alert_subject, 150),
    reminder_subject: text(o.reminder_subject, D.reminder_subject, 150),
  }
}

/** "{title}" placeholders; unknown ones are left as typed. */
export function fillTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

export async function getEventsFeedSettings(): Promise<EventsFeedSettingsDoc> {
  const { settingsCol } = await import('./store')
  const doc = await (await settingsCol()).findOne({ id: 'default' }, { projection: { _id: 0 } })
  return { ...(doc || {}), ...normalizeEventsFeedSettings({ ...EVENTS_FEED_DEFAULTS, ...(doc || {}) }), id: 'default' } as EventsFeedSettingsDoc
}

export async function saveEventsFeedSettings(patch: Record<string, unknown>): Promise<EventsFeedSettings> {
  const { settingsCol } = await import('./store')
  const current = await getEventsFeedSettings()
  const next = normalizeEventsFeedSettings({ ...current, ...patch })
  await (await settingsCol()).updateOne({ id: 'default' }, { $set: { ...next, updated_at: new Date().toISOString() } }, { upsert: true })
  return next
}

/**
 * Atomically claim a run marker: sets `field` to `nowIso` only if it is older
 * than `minGapMs` (or missing). True = this caller runs the job.
 */
export async function claimRun(field: 'last_pull_at' | 'last_alert_at', now: Date, minGapMs: number): Promise<boolean> {
  const { settingsCol } = await import('./store')
  const col = await settingsCol()
  const cutoff = new Date(now.getTime() - minGapMs).toISOString()
  await col.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true })
  const r = await col.updateOne(
    { id: 'default', $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $lt: cutoff } }] },
    { $set: { [field]: now.toISOString() } },
  )
  return r.modifiedCount > 0
}

export async function claimDigestWeek(weekKey: string): Promise<boolean> {
  const { settingsCol } = await import('./store')
  const col = await settingsCol()
  await col.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true })
  const r = await col.updateOne({ id: 'default', last_digest_week: { $ne: weekKey } }, { $set: { last_digest_week: weekKey } })
  return r.modifiedCount > 0
}
