/**
 * Langfuse LLM observability — fire-and-forget tracing for every AI call.
 *
 * Reads the API key from the existing `langfuse_api_key` secret slot
 * (Settings → API Keys → Langfuse). Needs two keys and a host:
 *   LANGFUSE_SECRET_KEY  (or the admin-stored `langfuse_api_key`)
 *   LANGFUSE_PUBLIC_KEY  (pk-lf-…)
 *   LANGFUSE_BASE_URL    (default https://cloud.langfuse.com)
 *
 * When no keys are configured the module exports no-ops — zero overhead,
 * zero errors, no dependency on Langfuse being available.
 *
 * ponytail: a single lazy client per process; the SDK batches internally and
 * flushes on shutdown, so no explicit flush management is needed. If the
 * import itself fails (e.g. the dep is missing in a stripped Docker image),
 * the whole module degrades to no-ops.
 */
import 'server-only'

// ---------------------------------------------------------------------------
// Types (so callers never need to import langfuse directly)
// ---------------------------------------------------------------------------

export interface LangfuseTraceInput {
  name: string
  userId?: string
  sessionId?: string
  metadata?: LfMeta
  tags?: string[]
}

/** Langfuse metadata: values must be JSON-serialisable scalars or string arrays. */
type LfMeta = Record<string, string | number | boolean | string[] | null>

export interface LangfuseGenerationInput {
  name: string
  model: string
  modelParameters?: Record<string, unknown>
  input?: unknown
  output?: unknown
  usage?: {
    input?: number
    output?: number
    total?: number
    unit?: 'TOKENS' | 'CHARACTERS'
  }
  metadata?: LfMeta
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
  /** Wall-clock ms for the LLM call. */
  latencyMs?: number
  startTime?: Date
  endTime?: Date
}

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded Langfuse instance; false = "tried and failed"
let _client: any = null
const FAILED = Symbol('langfuse-init-failed')

/**
 * Returns the shared Langfuse client, or null when unconfigured.
 */
async function getClient(): Promise<InstanceType<typeof import('langfuse').Langfuse> | null> {
  if (_client === FAILED) return null
  if (_client) return _client

  try {
    // Secret key: admin-stored or env
    let secretKey = process.env.LANGFUSE_SECRET_KEY?.trim() || ''
    if (!secretKey) {
      try {
        const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
        const secrets = await readServerSecrets()
        const stored = typeof secrets.langfuse_api_key === 'string' ? secrets.langfuse_api_key.trim() : ''
        if (stored && !isMaskedSecret(stored)) secretKey = stored
      } catch {
        // Server secrets not available — fall through to env-only.
      }
    }

    const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim() || ''
    const baseUrl = process.env.LANGFUSE_BASE_URL?.trim() || 'https://cloud.langfuse.com'

    if (!secretKey || !publicKey) {
      _client = FAILED
      return null
    }

    const { Langfuse } = await import('langfuse')
    _client = new Langfuse({
      secretKey,
      publicKey,
      baseUrl,
      // Batch config: flush every 5 s or 50 events (whichever comes first).
      flushAt: 50,
      flushInterval: 5_000,
    })

    return _client
  } catch (e) {
    console.warn('[langfuse] init failed, tracing disabled:', e instanceof Error ? e.message : e)
    _client = FAILED
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a top-level trace (one per user-visible request).
 * Returns a handle for adding generations/spans, or a no-op stub.
 */
export async function langfuseTrace(input: LangfuseTraceInput) {
  const client = await getClient()
  if (!client) return noopTrace

  try {
    const trace = client.trace({
      name: input.name,
      userId: input.userId,
      sessionId: input.sessionId,
      metadata: input.metadata,
      tags: input.tags,
    })
    return {
      /** Log an LLM generation (one model call) inside this trace. */
      generation(gen: LangfuseGenerationInput) {
        try {
          const startTime = gen.startTime ?? (gen.latencyMs ? new Date(Date.now() - gen.latencyMs) : undefined)
          const endTime = gen.endTime ?? new Date()
          trace.generation({
            name: gen.name,
            model: gen.model,
            modelParameters: gen.modelParameters as LfMeta,
            input: gen.input,
            output: gen.output,
            usage: gen.usage,
            metadata: gen.metadata,
            level: gen.level,
            startTime,
            endTime,
          })
        } catch {
          // Never fail the request.
        }
      },
      /** Update trace metadata after the call completes. */
      update(data: { output?: unknown; metadata?: LfMeta; level?: string }) {
        try {
          trace.update(data as any)
        } catch {
          // Never fail.
        }
      },
    }
  } catch {
    return noopTrace
  }
}

const noopTrace = {
  generation(_gen: LangfuseGenerationInput) { /* no-op */ },
  update(_data: { output?: unknown; metadata?: LfMeta; level?: string }) { /* no-op */ },
}

/**
 * Log a standalone LLM generation without a parent trace.
 * Use for fire-and-forget cost/latency tracking. Never throws.
 */
export async function langfuseGeneration(input: LangfuseGenerationInput & {
  traceId?: string
  userId?: string
  sessionId?: string
  tags?: string[]
}): Promise<void> {
  const client = await getClient()
  if (!client) return

  try {
    const startTime = input.startTime ?? (input.latencyMs ? new Date(Date.now() - input.latencyMs) : undefined)
    const endTime = input.endTime ?? new Date()

    // Create a trace for this standalone generation
    const trace = client.trace({
      name: input.name,
      userId: input.userId,
      sessionId: input.sessionId,
      tags: input.tags,
    })

    trace.generation({
      name: input.name,
      model: input.model,
      modelParameters: input.modelParameters as LfMeta,
      input: input.input,
      output: input.output,
      usage: input.usage,
      metadata: input.metadata,
      level: input.level,
      startTime,
      endTime,
    })
  } catch {
    // Fire-and-forget — never throw.
  }
}

/**
 * Log a Langfuse score (e.g. Jev verification, RAG faithfulness).
 * Scores tie to a trace by name and are visible on the Langfuse dashboard.
 */
export async function langfuseScore(input: {
  traceId?: string
  name: string
  value: number
  comment?: string
  dataType?: 'NUMERIC' | 'BOOLEAN'
}): Promise<void> {
  const client = await getClient()
  if (!client) return

  try {
    client.score({
      name: input.name,
      value: input.value,
      comment: input.comment,
      dataType: input.dataType,
      ...(input.traceId ? { traceId: input.traceId } : {}),
    } as any)
  } catch {
    // Never throw.
  }
}

/**
 * Flush pending events (call on server shutdown / edge function completion).
 * Safe to call when Langfuse is not configured — no-ops silently.
 */
export async function langfuseFlush(): Promise<void> {
  if (!_client || _client === FAILED) return
  try {
    await _client.flushAsync()
  } catch {
    // Best effort.
  }
}

/** True when a Langfuse client is configured and available. */
export async function langfuseEnabled(): Promise<boolean> {
  return (await getClient()) !== null
}

/** @internal — test-only: reset the cached client so the next call re-initialises. */
export function _resetClient(): void {
  _client = null
}
