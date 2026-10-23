/**
 * Support assistant (server only). One question → public help-centre search
 * (lib/rag public ACL, type `doc`) + the user's own records (./context) → a
 * short AI answer in the user's language, or — when AI is off, capped, over
 * budget, the text is flagged by the prompt guard, or the model fails — a
 * deterministic answer: the matching help articles and the user's own facts.
 * Every turn is logged without PII (assistant_turns, user_ref hash).
 */
import 'server-only'
import type { KnowledgeHit } from '@/lib/agent/contract'
import { publicCitations, publicHits } from '@/lib/public-ask/policy'
import { loadAnswer, recordRun, saveAnswer, takeAiSlot, userRef } from '../store'
import { loadFacts, type SupportUser } from './context'
import { renderFact } from './facts'
import {
  SUPPORT_SYSTEM, cleanSupportAnswer, pickContexts, shouldOfferEscalation, supportUserMessage, trimHistory, wantsHuman,
  type SupportAsk, type SupportFallback,
} from './policy'

export const SUPPORT_FEATURE = 'assistant-support'

export interface SupportAnswer {
  mode: 'ai' | 'fallback'
  fallback: SupportFallback | null
  answer: string | null
  /** The user's own facts the answer used (shown in the fallback card). */
  facts: string[]
  cited: number[]
  results: ReturnType<typeof publicCitations>
  escalate: boolean
  /** Server-side copy of the AI answer, quoted on escalation (AGT-040). */
  answer_id: string | null
}

export async function askSupport(user: SupportUser, body: SupportAsk, now = new Date()): Promise<SupportAnswer> {
  const started = now.toISOString()
  const orgAdmin = user.role === 'tenant_admin' && !!user.tenantId
  const contexts = pickContexts(body.q, { orgAdmin })
  const { searchPublicKnowledge } = await import('@/lib/rag/search')
  const [hits, loaded] = await Promise.all([
    searchPublicKnowledge({ query: body.q, types: ['doc'], limit: 5, userId: user.id }).then((h) => publicHits(h) as KnowledgeHit[]).catch(() => [] as KnowledgeHit[]),
    loadFacts(user, contexts),
  ])
  const results = publicCitations(hits)
  // SEO-045: English lines for the model; the fallback card shows the user's language.
  const factsEn = loaded.facts.map((f) => renderFact(f, 'en'))
  const history = trimHistory(body.history)
  const { scanUntrusted } = await import('@/lib/ai/untrusted-input')
  // Every history turn comes from the browser, "assistant" ones included: scan them all (AGT-040).
  const flagged = scanUntrusted([body.q, ...history.map((m) => m.text)].join('\n')).flagged
  const human = wantsHuman(body.q)

  let fallback: SupportFallback | null = null
  let answer: { text: string; cited: number[]; escalate: boolean } | null = null
  if (flagged) fallback = 'flagged'
  else if (!results.length && !loaded.facts.length) fallback = 'no_sources'
  else {
    const slot = await takeAiSlot('support', now)
    if (!slot.ok) fallback = slot.reason === 'off' ? 'ai_off' : slot.reason
    else {
      try {
        const [{ backendComplete }, { platformModelOverrides, extractJson }] = await Promise.all([import('@/lib/ai/backend'), import('@/lib/interviews/ai-mock-engine')])
        const res = await backendComplete({
          systemMessage: SUPPORT_SYSTEM,
          userMessage: supportUserMessage({ q: body.q, locale: body.locale, hits, facts: factsEn, history }),
          modelRole: 'fast', responseFormat: 'json', feature: SUPPORT_FEATURE, userId: user.id,
          // Answers carry the user's own records: never share them through the semantic cache.
          cache: false,
          ...(await platformModelOverrides()),
        })
        const json = res.ok ? (res.json && typeof res.json === 'object' ? res.json : extractJson(res.raw || res.text || '')) : null
        answer = json ? cleanSupportAnswer(json, results.length) : null
        if (!answer) fallback = 'ai_failed'
      } catch (e) {
        fallback = (e as { code?: string })?.code === 'ai_budget_exceeded' ? 'budget' : 'ai_failed'
      }
    }
  }

  const escalate = shouldOfferEscalation({ wantsHuman: human, modelSaysEscalate: !!answer?.escalate, hits: results.length, facts: loaded.facts.length, fallback })
  await recordRun({
    assistant: 'support', trigger: 'user', status: answer ? 'ok' : 'partial', started_at: started, tenant_id: user.tenantId ?? null,
    message: `${answer ? 'AI answer' : `Fallback (${fallback})`}; records: ${loaded.used.join(', ') || 'none'}; ${results.length} help article(s)${escalate ? '; offered a ticket' : ''}`,
    counts: { sources: results.length, facts: loaded.facts.length, escalate: escalate ? 1 : 0 },
    user_ref: userRef(user.id), ai: { used: !!answer, fallback },
  })
  const answerId = answer ? await saveAnswer(user.id, body.q, answer.text) : null
  return {
    mode: answer ? 'ai' : 'fallback', fallback, answer: answer?.text ?? null,
    facts: answer ? [] : loaded.facts.slice(0, 8).map((f) => renderFact(f, body.locale)), cited: answer?.cited ?? [], results, escalate, answer_id: answerId,
  }
}

/** Escalate: a support ticket in the user's own name with the question (and the assistant's answer). */
export async function escalateToTicket(user: SupportUser, input: { q: string; answer_id?: string; category: string }): Promise<{ id: string }> {
  // The quoted answer is the one this user was actually given (stored server-side), never text from the browser.
  const stored = input.answer_id ? await loadAnswer(user.id, input.answer_id) : null
  const { getMongoDb } = await import('@/lib/mongodb')
  const { newId, nowIso } = await import('@/lib/db/ids')
  const { ticketSubject } = await import('./policy')
  const ts = nowIso()
  const ticket = {
    id: newId(), user_id: user.id, user_email: user.email,
    subject: ticketSubject(input.q),
    message: stored ? `${input.q}\n\n— Help assistant's answer —\n${stored.answer.slice(0, 3000)}` : input.q,
    category: input.category, source: 'assistant', status: 'open', created_at: ts, updated_at: ts,
  }
  await (await getMongoDb()).collection('support_tickets').insertOne(ticket)
  await recordRun({ assistant: 'support', trigger: 'user', status: 'ok', tenant_id: user.tenantId ?? null, message: 'Escalated to a support ticket', counts: { tickets: 1 }, user_ref: userRef(user.id), ai: null })
  void import('@/lib/automation/events').then(({ emit }) => emit('support.ticket_created', { ticket_id: ticket.id, category: ticket.category, source: 'assistant' }, { idempotencyKey: `support.ticket_created:${ticket.id}` })).catch(() => null)
  return { id: ticket.id }
}
