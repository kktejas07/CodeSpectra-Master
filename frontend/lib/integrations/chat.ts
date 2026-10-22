/**
 * Hiring notifications to Slack and Microsoft Teams, per organisation.
 *
 *  Slack: an incoming webhook (hooks.slack.com) OR a bot token (xoxb-…, scope
 *         chat:write) + channel id, posted with chat.postMessage.
 *  Teams: an incoming webhook / Workflows ("Post to a channel when a webhook
 *         request is received") URL, posted as an Adaptive Card.
 *
 * Events: a new application, a test completed (submitted), a live drive's
 * status change. Message builders are pure (tests/integrations-chat.test.ts).
 */
import { isAllowedChatWebhook } from '@/lib/automation/settings'

export const CHAT_EVENTS = ['application', 'test_completed', 'drive_status'] as const
export type ChatEvent = (typeof CHAT_EVENTS)[number]

export interface ChatMessage {
  event: ChatEvent
  title: string
  lines: { label: string; value: string }[]
  url: string | null
}

export interface SlackSecret { webhook_url?: string; bot_token?: string }
export interface SlackConfig { mode: 'webhook' | 'bot'; channel: string | null; events: ChatEvent[] }
export interface TeamsSecret { webhook_url: string }
export interface TeamsConfig { events: ChatEvent[] }

const clip = (s: unknown, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n)

/** Slack mrkdwn needs &, <, > escaped. */
export function slackEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function isSlackBotToken(v: unknown): v is string {
  return typeof v === 'string' && /^xoxb-[A-Za-z0-9-]{10,250}$/.test(v)
}

export function isSlackChannel(v: unknown): v is string {
  return typeof v === 'string' && /^[CGD][A-Z0-9]{6,20}$/.test(v)
}

/** Event payload → message (English: chat channels are shared by a team). */
export function chatMessage(event: ChatEvent, p: Record<string, unknown>, origin: string): ChatMessage {
  if (event === 'application') {
    return {
      event,
      title: `New application: ${clip(p.candidate_name || 'A candidate', 80)} for ${clip(p.job_title || 'a job', 120)}`,
      lines: [
        { label: 'Source', value: clip(p.source || '—', 60) },
        ...(typeof p.match_score === 'number' ? [{ label: 'Match', value: `${Math.round(p.match_score)}%` }] : []),
      ],
      url: p.candidate_id ? `${origin}/dashboard/hiring/candidates/${encodeURIComponent(clip(p.candidate_id, 80))}` : `${origin}/dashboard/hiring`,
    }
  }
  if (event === 'test_completed') {
    const score = typeof p.score === 'number' && typeof p.max_score === 'number' && p.max_score > 0 ? `${p.score} / ${p.max_score}` : '—'
    return {
      event,
      title: `Test completed: ${clip(p.exam_title || 'Assessment', 120)}`,
      lines: [
        { label: 'Candidate', value: clip(p.email || p.user_id || '—', 120) },
        { label: 'Score', value: p.has_pending_review ? `${score} (needs grading)` : score },
        ...(p.late_submit ? [{ label: 'Note', value: 'Submitted late' }] : []),
      ],
      url: p.exam_id ? `${origin}/dashboard/admin/assessments/${encodeURIComponent(clip(p.exam_id, 80))}` : null,
    }
  }
  return {
    event,
    title: `Live drive ${clip(p.status || 'updated', 30)}: ${clip(p.title || 'Drive', 120)}`,
    lines: [
      ...(p.starts_at ? [{ label: 'Starts', value: clip(p.starts_at, 40) }] : []),
      ...(typeof p.candidates === 'number' ? [{ label: 'Candidates', value: String(p.candidates) }] : []),
    ],
    url: p.drive_id ? `${origin}/dashboard/live-drives/${encodeURIComponent(clip(p.drive_id, 80))}` : null,
  }
}

export function slackPayload(m: ChatMessage, channel?: string | null): Record<string, unknown> {
  const fields = m.lines.map((l) => `*${slackEscape(l.label)}:* ${slackEscape(l.value)}`).join('\n')
  return {
    ...(channel ? { channel } : {}),
    text: m.title,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${slackEscape(m.title)}*${fields ? `\n${fields}` : ''}` } },
      ...(m.url ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in CodeSpectra' }, url: m.url }] }] : []),
    ],
    unfurl_links: false,
  }
}

export function teamsPayload(m: ChatMessage): Record<string, unknown> {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: m.title, weight: 'Bolder', wrap: true },
          ...(m.lines.length ? [{ type: 'FactSet', facts: m.lines.map((l) => ({ title: l.label, value: l.value })) }] : []),
        ],
        actions: m.url ? [{ type: 'Action.OpenUrl', title: 'Open in CodeSpectra', url: m.url }] : [],
      },
    }],
  }
}

/** Validate a Slack connection from the settings form. */
export function validateSlack(raw: Record<string, unknown>): { ok: true; secret: SlackSecret; config: SlackConfig } | { ok: false; error: string } {
  const events = cleanEvents(raw.events)
  if (raw.mode === 'bot') {
    if (!isSlackBotToken(raw.bot_token)) return { ok: false, error: 'Paste the bot token (starts with xoxb-).' }
    if (!isSlackChannel(raw.channel)) return { ok: false, error: 'Paste the channel ID (for example C0123456789).' }
    return { ok: true, secret: { bot_token: raw.bot_token }, config: { mode: 'bot', channel: raw.channel, events } }
  }
  const url = String(raw.webhook_url || '').trim()
  if (!isAllowedChatWebhook(url) || !url.startsWith('https://hooks.slack.com/')) return { ok: false, error: 'Paste a Slack incoming-webhook URL (https://hooks.slack.com/…).' }
  return { ok: true, secret: { webhook_url: url }, config: { mode: 'webhook', channel: null, events } }
}

export function validateTeams(raw: Record<string, unknown>): { ok: true; secret: TeamsSecret; config: TeamsConfig } | { ok: false; error: string } {
  const url = String(raw.webhook_url || '').trim()
  if (!isAllowedChatWebhook(url) || url.startsWith('https://hooks.slack.com/')) return { ok: false, error: 'Paste a Microsoft Teams incoming-webhook or Workflows URL.' }
  return { ok: true, secret: { webhook_url: url }, config: { events: cleanEvents(raw.events) } }
}

export function cleanEvents(v: unknown): ChatEvent[] {
  const list = Array.isArray(v) ? v.filter((e): e is ChatEvent => (CHAT_EVENTS as readonly string[]).includes(String(e))) : [...CHAT_EVENTS]
  return [...new Set(list)]
}

/** Mask a stored URL / token for display. */
export function maskSecret(s: string | undefined | null): string | null {
  if (!s) return null
  return s.length <= 12 ? '••••' : `${s.slice(0, 18)}…${s.slice(-4)}`
}
