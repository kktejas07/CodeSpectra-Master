/**
 * Payload contract for POST /api/analytics/collect (validated server side).
 *
 *   { v: 1, mode: 'anon' | 'full', aid?, sid?, events: [
 *       { t: 'pv', path, ref?, utm?, title?, ts? }            page view
 *       { t: 'ev', name, path, props?, ts? }                   custom event
 *       { t: 'wv', name, value, rating?, path, id?, ts? }      web vital
 *   ] }
 *
 * `aid` / `sid` are only honoured in 'full' mode (analytics consent given).
 */
import { z } from 'zod'

export const MAX_BATCH = 30
export const MAX_BODY_BYTES = 16_384

const path = z.string().min(1).max(2048)
const ts = z.string().max(40).optional()
const shortStr = z.string().max(200)

const utm = z.object({
  source: shortStr.optional(),
  medium: shortStr.optional(),
  campaign: shortStr.optional(),
  term: shortStr.optional(),
  content: shortStr.optional(),
}).strict().optional()

const pageView = z.object({ t: z.literal('pv'), path, ref: z.string().max(2048).optional(), utm, title: z.string().max(300).optional(), ts }).strict()
const custom = z.object({
  t: z.literal('ev'),
  name: z.string().regex(/^[a-z][a-z0-9_.:-]{0,63}$/),
  path,
  props: z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  ts,
}).strict()
export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const
const vital = z.object({
  t: z.literal('wv'),
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().min(0).max(600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  id: z.string().max(128).optional(),
  nav: z.string().max(32).optional(),
  path,
  ts,
}).strict()

const ID = /^[A-Za-z0-9_-]{8,64}$/

export const collectSchema = z.object({
  v: z.literal(1),
  mode: z.enum(['anon', 'full']),
  aid: z.string().regex(ID).optional(),
  sid: z.string().regex(ID).optional(),
  events: z.array(z.discriminatedUnion('t', [pageView, custom, vital])).min(1).max(MAX_BATCH),
}).strict()

export type CollectPayload = z.infer<typeof collectSchema>
export type CollectEvent = CollectPayload['events'][number]

/** Client timestamps are advisory: clamp to [now - 1h, now]. */
export function clampTs(raw: string | undefined, now: Date): Date {
  const t = raw ? Date.parse(raw) : NaN
  if (!Number.isFinite(t)) return now
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - 3_600_000, t)))
}
