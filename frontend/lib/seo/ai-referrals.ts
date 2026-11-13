/**
 * AI referrals: visits that arrive from an AI assistant (ChatGPT, Perplexity,
 * Gemini, Claude, Copilot…). Built on what analytics already records — each
 * session's `source` is its utm_source, else the referrer host — so nothing new
 * is collected.
 *
 * Blind spots, shown in the admin panel: Google AI Overviews and AI Mode send
 * visitors with a plain google.com referrer, and assistants that open links in
 * an app often send no referrer at all; both are counted elsewhere (Google /
 * direct), not here.
 */
import { unsafeKey, type Counter } from '@/lib/analytics/rollup'

/** Hosts (also matched as a subdomain suffix) and bare utm_source names per assistant. */
export const AI_ENGINES: ReadonlyArray<{ id: string; label: string; hosts: string[]; names: string[] }> = [
  { id: 'chatgpt', label: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'], names: ['chatgpt', 'openai'] },
  { id: 'perplexity', label: 'Perplexity', hosts: ['perplexity.ai'], names: ['perplexity'] },
  { id: 'gemini', label: 'Gemini', hosts: ['gemini.google.com', 'bard.google.com'], names: ['gemini', 'bard'] },
  { id: 'claude', label: 'Claude', hosts: ['claude.ai'], names: ['claude'] },
  { id: 'copilot', label: 'Microsoft Copilot', hosts: ['copilot.microsoft.com'], names: ['copilot'] },
  { id: 'meta', label: 'Meta AI', hosts: ['meta.ai'], names: ['meta-ai', 'metaai'] },
  { id: 'grok', label: 'Grok', hosts: ['grok.com', 'x.ai'], names: ['grok'] },
  { id: 'deepseek', label: 'DeepSeek', hosts: ['deepseek.com'], names: ['deepseek'] },
  { id: 'mistral', label: 'Le Chat (Mistral)', hosts: ['chat.mistral.ai'], names: ['lechat'] },
  { id: 'you', label: 'You.com', hosts: ['you.com'], names: [] },
  { id: 'phind', label: 'Phind', hosts: ['phind.com'], names: ['phind'] },
  { id: 'duckai', label: 'Duck.ai', hosts: ['duck.ai'], names: [] },
]

/** Which assistant a session source belongs to, or null (search, social, direct…). */
export function aiEngineOf(source: string | null | undefined): string | null {
  const s = String(source || '').trim().toLowerCase().replace(/^www\./, '')
  if (!s) return null
  for (const e of AI_ENGINES) {
    if (e.names.includes(s)) return e.id
    if (e.hosts.some((h) => s === h || s.endsWith('.' + h))) return e.id
  }
  return null
}

/** Every exact source value we can ask the database for (hosts + bare names). */
export const AI_SOURCE_VALUES: string[] = AI_ENGINES.flatMap((e) => [...e.hosts, ...e.names])

export interface AiReferralDay { day: string; sessions: number; ai_sessions: number }
export interface AiReferralReport {
  days: number
  total_sessions: number
  ai_sessions: number
  /** AI sessions as a percentage of all sessions (one decimal), 0 when there are none. */
  share_pct: number
  engines: { id: string; label: string; sessions: number }[]
  series: AiReferralDay[]
  /** First page of AI-referred sessions; empty when raw events are unavailable. */
  landings: { path: string; sessions: number }[]
}

type DayRow = { day?: string; _id?: unknown; sessions?: number; sources?: Counter }

/**
 * Pure: daily rollups → totals per assistant and per day.
 * ponytail: reads each day's top-200 `sources` counter, so an assistant that is
 * not in a day's top 200 sources is missed for that day. Raise TOP_N or query
 * raw events if AI traffic ever needs exact counts on very long-tail days.
 */
export function summarizeAiReferrals(rollups: DayRow[], allDays: string[]): Omit<AiReferralReport, 'landings'> {
  const byDay = new Map(rollups.map((r) => [String(r.day || r._id), r]))
  const perEngine: Record<string, number> = {}
  let total = 0
  let ai = 0
  const series: AiReferralDay[] = allDays.map((day) => {
    const r = byDay.get(day)
    const sessions = Number(r?.sessions || 0)
    let dayAi = 0
    for (const [key, n] of Object.entries(r?.sources || {})) {
      const engine = aiEngineOf(unsafeKey(key))
      if (!engine) continue
      perEngine[engine] = (perEngine[engine] || 0) + Number(n || 0)
      dayAi += Number(n || 0)
    }
    total += sessions
    ai += dayAi
    return { day, sessions, ai_sessions: dayAi }
  })
  return {
    days: allDays.length,
    total_sessions: total,
    ai_sessions: ai,
    share_pct: total > 0 ? Math.round((ai / total) * 1000) / 10 : 0,
    engines: AI_ENGINES.map((e) => ({ id: e.id, label: e.label, sessions: perEngine[e.id] || 0 })).filter((e) => e.sessions > 0).sort((a, b) => b.sessions - a.sessions),
    series,
  }
}

/** Sessions that started from an assistant → their first public page, top 15. */
export function aiLandingsPipeline(fromDay: string, toDay: string): Record<string, unknown>[] {
  return [
    { $match: { day: { $gte: fromDay, $lte: toDay }, event: 'page_view', private: { $ne: true }, source: { $in: AI_SOURCE_VALUES }, session_id: { $type: 'string' } } },
    { $sort: { ts: 1 } },
    { $group: { _id: '$session_id', path: { $first: '$path' } } },
    { $group: { _id: '$path', n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    { $limit: 15 },
  ]
}

export async function loadAiReferrals(days: string[]): Promise<AiReferralReport> {
  const { rollupsCol, eventsCol } = await import('@/lib/analytics/store')
  const docs = (await (await rollupsCol()).find({ _id: { $in: days } } as never, { projection: { day: 1, sessions: 1, sources: 1 } }).toArray()) as unknown as DayRow[]
  const summary = summarizeAiReferrals(docs, days)
  let landings: AiReferralReport['landings'] = []
  if (summary.ai_sessions > 0 && days.length) {
    try {
      const rows = await (await eventsCol()).aggregate(aiLandingsPipeline(days[0], days[days.length - 1]), { allowDiskUse: true }).toArray()
      landings = rows.map((r) => ({ path: String(r._id || '/'), sessions: Number(r.n || 0) }))
    } catch (e) {
      console.error('[seo] AI landing pages failed:', (e as Error)?.message)
    }
  }
  return { ...summary, landings }
}
