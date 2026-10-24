/**
 * Mem0 candidate profile memory — persistent memory across hiring loops.
 *
 * Wraps the Mem0 cloud SDK (`mem0ai`) with the same lazy-singleton pattern as
 * Langfuse: reads the API key from admin-stored `mem0_api_key` secret or env,
 * degrades to no-ops when unconfigured.
 *
 * Used by hiring agent tools to remember candidate facts (skills, preferences,
 * interview outcomes) across multiple hiring loops and interviews so the agent
 * has full context without re-reading everything.
 *
 * ponytail: thin wrapper — just key resolution + no-op fallback. The SDK does
 * all the heavy lifting (embedding, storage, retrieval, ranking).
 */
import 'server-only'

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _client: any = null
const FAILED = Symbol('mem0-init-failed')

async function getClient(): Promise<InstanceType<typeof import('mem0ai').MemoryClient> | null> {
  if (_client === FAILED) return null
  if (_client) return _client

  try {
    let apiKey = process.env.MEM0_API_KEY?.trim() || ''
    if (!apiKey) {
      try {
        const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
        const secrets = await readServerSecrets()
        const stored = typeof secrets.mem0_api_key === 'string' ? secrets.mem0_api_key.trim() : ''
        if (stored && !isMaskedSecret(stored)) apiKey = stored
      } catch {
        // Server secrets not available.
      }
    }

    if (!apiKey) {
      _client = FAILED
      return null
    }

    const { MemoryClient } = await import('mem0ai')
    _client = new MemoryClient({ apiKey })
    return _client
  } catch (e) {
    console.warn('[mem0] init failed, candidate memory disabled:', e instanceof Error ? e.message : e)
    _client = FAILED
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CandidateMemoryInput {
  candidateId: string
  orgId: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  metadata?: Record<string, string | number | boolean | null>
}

/**
 * Add candidate interaction to memory. Mem0 extracts and stores the relevant
 * facts automatically — no need to manually parse what to remember.
 *
 * Call after interview completions, screening outcomes, or any hiring agent
 * interaction with a candidate.
 */
export async function addCandidateMemory(input: CandidateMemoryInput): Promise<void> {
  const client = await getClient()
  if (!client) return

  try {
    await client.add(input.messages, {
      userId: input.candidateId,
      metadata: { org_id: input.orgId, ...input.metadata } as any,
    })
  } catch (e) {
    console.warn('[mem0] addCandidateMemory failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Search candidate memories by a natural-language query.
 * Returns ranked memory entries the hiring agent can inject into its context.
 */
export async function searchCandidateMemory(opts: {
  candidateId: string
  orgId: string
  query: string
  limit?: number
}): Promise<Array<{ id: string; memory: string; score?: number }>> {
  const client = await getClient()
  if (!client) return []

  try {
    const results = await client.search(opts.query, {
      filters: { user_id: opts.candidateId, org_id: opts.orgId },
      topK: opts.limit ?? 10,
    })
    // Normalize the SDK response shape
    const items = Array.isArray(results) ? results : (results as any)?.results ?? []
    return items.map((r: any) => ({
      id: r.id ?? '',
      memory: r.memory ?? r.text ?? '',
      score: r.score ?? r.relevance_score,
    }))
  } catch (e) {
    console.warn('[mem0] searchCandidateMemory failed:', e instanceof Error ? e.message : e)
    return []
  }
}

/**
 * Get all stored memories for a candidate (for profile/summary views).
 */
export async function getCandidateMemories(opts: {
  candidateId: string
  orgId: string
}): Promise<Array<{ id: string; memory: string }>> {
  const client = await getClient()
  if (!client) return []

  try {
    const results = await client.getAll({
      filters: { user_id: opts.candidateId, org_id: opts.orgId },
    })
    const items = Array.isArray(results) ? results : (results as any)?.results ?? []
    return items.map((r: any) => ({
      id: r.id ?? '',
      memory: r.memory ?? r.text ?? '',
    }))
  } catch (e) {
    console.warn('[mem0] getCandidateMemories failed:', e instanceof Error ? e.message : e)
    return []
  }
}

/**
 * Delete all memories for a candidate (GDPR / data-retention compliance).
 */
export async function deleteCandidateMemories(opts: {
  candidateId: string
  orgId: string
}): Promise<void> {
  const client = await getClient()
  if (!client) return

  try {
    await client.deleteAll({
      userId: opts.candidateId,
    })
  } catch (e) {
    console.warn('[mem0] deleteCandidateMemories failed:', e instanceof Error ? e.message : e)
  }
}

/** True when a Mem0 client is configured and available. */
export async function mem0Enabled(): Promise<boolean> {
  return (await getClient()) !== null
}

/** @internal — test-only: reset the cached client so the next call re-initialises. */
export function _resetClient(): void {
  _client = null
}
