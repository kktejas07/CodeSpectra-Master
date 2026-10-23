/** Deliver a hiring event to the organisation's Slack / Teams (once per key). Never throws. */
import 'server-only'
import { getAppOrigin } from '@/lib/app-origin'
import { chatMessage, slackPayload, teamsPayload, type ChatEvent, type ChatMessage, type SlackConfig, type SlackSecret, type TeamsConfig, type TeamsSecret } from './chat'
import { getSecret, markIntegrationError } from './store'

async function postSlack(secret: SlackSecret, cfg: SlackConfig, m: ChatMessage): Promise<void> {
  if (cfg.mode === 'bot' && secret.bot_token) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret.bot_token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(slackPayload(m, cfg.channel)),
      signal: AbortSignal.timeout(10_000),
    })
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !j.ok) throw new Error(`Slack answered ${j.error || res.status}`)
    return
  }
  if (!secret.webhook_url) throw new Error('Slack is not set up')
  const { postChatWebhook } = await import('@/lib/automation/alerts')
  await postChatWebhook(secret.webhook_url, slackPayload(m))
}

export async function sendChatMessage(tenantId: string, m: ChatMessage, opts: { force?: boolean } = {}): Promise<{ slack: boolean; teams: boolean }> {
  const out = { slack: false, teams: false }
  const [slack, teams] = await Promise.all([
    getSecret<SlackSecret>(tenantId, 'slack').catch(() => null),
    getSecret<TeamsSecret>(tenantId, 'teams').catch(() => null),
  ])
  if (slack?.secret && (opts.force || ((slack.row.config as unknown as SlackConfig).events || []).includes(m.event))) {
    try {
      await postSlack(slack.secret, slack.row.config as unknown as SlackConfig, m)
      out.slack = true
    } catch (e) {
      await markIntegrationError(tenantId, 'slack', (e as Error).message)
      if (opts.force) throw e
    }
  }
  if (teams?.secret?.webhook_url && (opts.force || ((teams.row.config as unknown as TeamsConfig).events || []).includes(m.event))) {
    try {
      const { postChatWebhook } = await import('@/lib/automation/alerts')
      await postChatWebhook(teams.secret.webhook_url, teamsPayload(m))
      out.teams = true
    } catch (e) {
      await markIntegrationError(tenantId, 'teams', (e as Error).message)
      if (opts.force) throw e
    }
  }
  return out
}

/** Hiring event → Slack / Teams, once per `onceKey`. */
export async function notifyHiringChat(tenantId: string | null | undefined, event: ChatEvent, payload: Record<string, unknown>, onceKey: string): Promise<void> {
  if (!tenantId) return
  try {
    const { claimOnce } = await import('@/lib/automation/store')
    if (!(await claimOnce(`chat:${tenantId}:${onceKey}`))) return
    await sendChatMessage(tenantId, chatMessage(event, payload, getAppOrigin()))
  } catch (e) {
    console.error('[integrations/chat] send failed', (e as Error)?.message)
  }
}
