/**
 * One AI call for an agent loop (server only).
 *
 * Guards, in order: the loop's "use AI" switch, its monthly spend cap (feature
 * spend recorded by backendComplete → recordAiUsage), the platform budget hard
 * stop, the prompt guard on every piece of member / third-party text (flagged
 * → no call), then the loop's daily call cap (atomic). Any block or failure
 * returns `json: null` and the reason, and the caller uses its deterministic
 * fallback. Untrusted text is fenced as data in the user message.
 */
import 'server-only'
import { loopDef, type AgentLoopId } from './registry'
import { loopAiBlocked, type AgentLoopSettings, type LoopAiBlock } from './settings'
import { takeAiCall } from './store'

export interface LoopAiTally { calls: number; fallback: LoopAiBlock | null }

export async function loopAi(
  loop: AgentLoopId,
  settings: AgentLoopSettings,
  tally: LoopAiTally,
  req: { system: string; trusted: string; untrusted?: Record<string, string>; modelRole?: 'fast' | 'reasoning' },
): Promise<unknown | null> {
  const feature = loopDef(loop).aiFeature
  const block = (b: LoopAiBlock) => { tally.fallback = b; return null }
  const [{ capSpendFor, aiBudgetBlocks }, { scanUntrusted, fenceUntrusted, untrustedRule }] = await Promise.all([
    import('@/lib/ai/usage-record'), import('@/lib/ai/untrusted-input'),
  ])
  const pre = loopAiBlocked(settings, 0, await capSpendFor([feature], 0))
  if (pre) return block(pre)
  if (await aiBudgetBlocks(feature)) return block('budget')
  const parts = Object.entries(req.untrusted ?? {})
  if (parts.some(([, text]) => scanUntrusted(text).flagged)) return block('flagged')
  if (!(await takeAiCall(loop, settings.daily_ai_cap))) return block('daily_cap')
  tally.calls++
  try {
    const [{ backendComplete }, { platformModelOverrides, extractJson }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/interviews/ai-mock-engine')])
    const tags = parts.map(([tag]) => tag)
    const res = await backendComplete({
      systemMessage: tags.length ? `${req.system}\n${untrustedRule(tags)}` : req.system,
      userMessage: [req.trusted, ...parts.map(([tag, text]) => fenceUntrusted(tag, text, 8000))].join('\n\n'),
      modelRole: req.modelRole ?? 'fast',
      responseFormat: 'json',
      feature,
      userId: `system:agent-loop:${loop}`,
      cache: false,
      ...(await platformModelOverrides()),
    })
    if (!res.ok) return block('ai_failed')
    const json = res.json && typeof res.json === 'object' ? res.json : extractJson(res.raw || res.text || '')
    return json && typeof json === 'object' ? json : block('ai_failed')
  } catch (e) {
    const code = (e as { code?: string })?.code
    return block(code === 'ai_budget_exceeded' ? 'budget' : 'ai_failed')
  }
}
