/**
 * RAG Pipeline — Corrective RAG + Agentic Loop for EDITH.
 *
 * Flow:
 *   1. Route query → intent + source types  (router.ts, free)
 *   2. Parallel retrieval from matched sources  (searchKnowledge)
 *   3. Grade relevance — discard chunks below threshold
 *   4. If no relevant chunks → web search fallback (signals to caller)
 *   5. Build a structured context block for the LLM
 *
 * The self-eval / retry loop is intentionally kept simple: one pass,
 * grade, decide. The eval harness (lib/rag/eval/) handles offline
 * quality measurement; this is the lightweight online path.
 *
 * ponytail: single retrieval pass; no multi-hop. Extend if evals show gaps.
 */
import type { AgentCaller } from '@/lib/agent/contract'
import { searchKnowledge } from './search'
import { routeQuery, type RouterResult } from './router'

/* ── Config ─────────────────────────────────────────────────────────────── */

/** Minimum relevance score to keep a chunk (0–1, cosine-like). */
const MIN_RELEVANCE = 0.25
/** Max context chunks injected into the LLM prompt. */
const MAX_CHUNKS = 8
/** If fewer than this many relevant chunks survive grading → request web fallback. */
const FALLBACK_THRESHOLD = 2

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface PipelineResult {
  /** Formatted context block to inject into the LLM system prompt. */
  context: string
  /** Source citations shown in the UI. */
  sources: Array<{ title: string; url: string }>
  /** True when the retrieval came up empty — caller should do a web search. */
  needsWebFallback: boolean
  /** Routing debug info (intent label, source types used). */
  route: RouterResult
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Format a relevance score as a rough label for context headers. */
function relevanceLabel(score: number): string {
  if (score >= 0.75) return 'high'
  if (score >= 0.45) return 'medium'
  return 'low'
}

/* ── Main entry ─────────────────────────────────────────────────────────── */

/**
 * Run the full RAG pipeline for a user query.
 *
 * @param query   - The user's message
 * @param caller  - AgentCaller built from the authenticated session
 */
export async function runRagPipeline(
  query: string,
  caller: AgentCaller,
): Promise<PipelineResult> {
  // ── 1. Route ──────────────────────────────────────────────────────────────
  const route = routeQuery(query)

  // ── 2. Retrieve ───────────────────────────────────────────────────────────
  let hits: Awaited<ReturnType<typeof searchKnowledge>> = []
  try {
    hits = await searchKnowledge({
      caller,
      query,
      types: route.types,
      limit: MAX_CHUNKS + 4, // fetch a few extra so grading can trim
    })
  } catch {
    // Search failure is non-fatal — fall back to web
    return {
      context: '',
      sources: [],
      needsWebFallback: true,
      route,
    }
  }

  // ── 3. Grade relevance ───────────────────────────────────────────────────
  const relevant = hits
    .filter((h) => h.score >= MIN_RELEVANCE)
    .slice(0, MAX_CHUNKS)

  // ── 4. Check for fallback ─────────────────────────────────────────────────
  const needsWebFallback = relevant.length < FALLBACK_THRESHOLD

  if (needsWebFallback) {
    return {
      context: '',
      sources: [],
      needsWebFallback: true,
      route,
    }
  }

  // ── 5. Build context block ────────────────────────────────────────────────
  const contextLines: string[] = [
    `[Knowledge retrieved from ${route.label} (${relevant.length} chunks):]`,
    '',
  ]

  const sources: Array<{ title: string; url: string }> = []

  for (let i = 0; i < relevant.length; i++) {
    const h = relevant[i]
    const label = relevanceLabel(h.score)
    contextLines.push(`--- Source ${i + 1} [${h.source_type}, relevance: ${label}] ---`)
    contextLines.push(`Title: ${h.title}`)
    if (h.url) contextLines.push(`URL: ${h.url}`)
    contextLines.push(h.snippet)
    contextLines.push('')

    // Collect unique sources with URLs for UI citation cards
    if (h.url && !sources.find((s) => s.url === h.url)) {
      sources.push({ title: h.title, url: h.url })
    }
  }

  contextLines.push(
    'Use the sources above to answer the question. Cite the source title when referencing specific content. Do not invent information beyond what is provided.',
  )

  return {
    context: contextLines.join('\n'),
    sources,
    needsWebFallback: false,
    route,
  }
}
