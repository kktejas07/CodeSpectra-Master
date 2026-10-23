/**
 * Per-request AI usage meter (AGT-002). Code that runs AI on someone's behalf
 * (e.g. an agent tool's propose() generating questions) runs inside
 * `withUsageMeter(meter, fn)`; every model call made by lib/ai/backend inside
 * reports its real token usage to that meter, so the caller can charge it.
 * Outside a meter, reporting is a no-op. Server only (AsyncLocalStorage).
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface MeteredUsage {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  feature?: string
  /** Cost recorded for this call (integer micro-dollars, lib/ai/usage-record); absent → estimate. */
  costMicros?: number
}

export type UsageMeter = (u: MeteredUsage) => void

const store = new AsyncLocalStorage<UsageMeter>()

export function withUsageMeter<T>(meter: UsageMeter, fn: () => Promise<T>): Promise<T> {
  // Nested meters both see the call (e.g. a feature's own cap inside an agent tool).
  const outer = store.getStore()
  return store.run(outer ? (u) => { meter(u); outer(u) } : meter, fn)
}

export function reportAiUsage(u: MeteredUsage): void {
  const meter = store.getStore()
  if (!meter) return
  try {
    meter({
      provider: u.provider || 'unknown',
      model: u.model || 'unknown',
      inputTokens: Math.max(0, Math.floor(Number(u.inputTokens) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(u.outputTokens) || 0)),
      ...(u.feature ? { feature: u.feature } : {}),
      ...(typeof u.costMicros === 'number' && Number.isFinite(u.costMicros) && u.costMicros >= 0 ? { costMicros: Math.round(u.costMicros) } : {}),
    })
  } catch {
    /* metering never breaks the call */
  }
}

/** Token estimate when a provider returns no usage (≈ 4 chars per token). */
export function estimateTokens(text: string | null | undefined): number {
  return Math.ceil(String(text ?? '').length / 4)
}

/**
 * USD for one metered call: the recorded cost when the recorder priced it,
 * else `estimate()` (the feature's previous token estimate). Pure.
 */
export function meteredUsd(u: Pick<MeteredUsage, 'costMicros'>, estimate: () => number): number {
  return typeof u.costMicros === 'number' ? u.costMicros / 1_000_000 : estimate()
}
