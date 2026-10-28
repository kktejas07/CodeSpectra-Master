/**
 * AI caption drafts for the social studio (server only).
 *
 * One model call writes every platform's caption in one language. Guards:
 *  - settings switch, a daily draft cap (atomic) and a monthly spend cap for
 *    feature `social_studio` (recorded by backendComplete → recordAiUsage),
 *    plus the platform budget hard stop inside backendComplete;
 *  - the item text is untrusted (third-party listings): scanned by the
 *    prompt guard first — flagged → no model call, template captions;
 *  - output is cleaned and fact-checked per platform (lib/social/captions);
 *    anything that fails falls back to the template caption.
 */
import 'server-only'
import { CAPTION_SYSTEM, captionUserMessage, cleanCaptions, factsText, templateCaptions } from './captions'
import { aiBlocked, type AiBlock } from './settings'
import { getSocialSettings, takeDraftSlot } from './store'
import { socialLink } from './share'
import type { CaptionLang, SocialPlatform, SocialQueueDoc } from './types'
import { SOCIAL_PLATFORMS } from './types'

export const SOCIAL_AI_FEATURE = 'social_studio'

export interface DraftResult {
  captions: Record<SocialPlatform, { text: string; ai: boolean }>
  /** Why the model was not used (template captions instead), if it wasn't. */
  fallback: AiBlock | 'flagged' | 'ai_failed' | null
}

export async function aiStatus(): Promise<{ blocked: AiBlock | null; draftsToday: number; spentUsd: number; cap: number; monthlyCapUsd: number; enabled: boolean }> {
  const { settings, draftsToday } = await getSocialSettings()
  const { capSpendFor } = await import('@/lib/ai/usage-record')
  const spentUsd = await capSpendFor([SOCIAL_AI_FEATURE], 0)
  return { blocked: aiBlocked(settings, draftsToday, spentUsd), draftsToday, spentUsd, cap: settings.daily_ai_cap, monthlyCapUsd: settings.monthly_cost_cap_usd, enabled: settings.ai_enabled }
}

export async function draftCaptions(item: SocialQueueDoc, lang: CaptionLang, userId: string, opts: { useAi: boolean }): Promise<DraftResult> {
  const xLink = socialLink(item.url, 'x', item.type)
  const tpl = templateCaptions(item, lang, xLink)
  const fromTemplate = (fallback: DraftResult['fallback']): DraftResult => ({
    captions: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, { text: tpl[p], ai: false }])) as DraftResult['captions'],
    fallback,
  })
  if (!opts.useAi) return fromTemplate(null)

  const st = await aiStatus()
  if (st.blocked) return fromTemplate(st.blocked)
  const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
  if (scanUntrusted(factsText(item)).flagged) return fromTemplate('flagged')
  const { settings } = await getSocialSettings()
  if (!(await takeDraftSlot(settings.daily_ai_cap))) return fromTemplate('daily_cap')

  try {
    const [{ backendComplete }, { platformModelOverrides, extractJson }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/interviews/ai-mock-engine')])
    const res = await backendComplete({
      systemMessage: CAPTION_SYSTEM,
      userMessage: captionUserMessage(item, lang),
      modelRole: 'fast',
      responseFormat: 'json',
      feature: SOCIAL_AI_FEATURE,
      userId,
      cache: false,
      ...(await platformModelOverrides()),
    })
    if (!res.ok) return fromTemplate('ai_failed')
    const json = res.json && typeof res.json === 'object' ? res.json : extractJson(res.raw || res.text || '')
    const clean = cleanCaptions(json, item, xLink)
    if (!Object.keys(clean).length) return fromTemplate('ai_failed')
    return {
      captions: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, clean[p] ? { text: clean[p]!, ai: true } : { text: tpl[p], ai: false }])) as DraftResult['captions'],
      fallback: null,
    }
  } catch (e) {
    const code = (e as { code?: string })?.code
    console.warn('[social] AI draft failed:', code || (e as Error)?.message)
    return fromTemplate(code === 'ai_budget_exceeded' ? 'monthly_cap' : 'ai_failed')
  }
}
