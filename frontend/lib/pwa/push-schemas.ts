/** Request validation for /api/push/* (zod). */
import { z } from 'zod'

const b64url = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+=*$/, 'invalid key')

/** Browser PushSubscription.toJSON(). Endpoints are https URLs on the browser vendor's push service. */
export const subscribeSchema = z.object({
  endpoint: z.string().url().max(1024).refine((u) => u.startsWith('https://'), 'endpoint must be https'),
  keys: z.object({ p256dh: b64url(40, 200), auth: b64url(8, 64) }),
  replaces: z.string().url().max(1024).optional(),
})

export const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1024) })

export const preferenceSchema = z.object({ enabled: z.boolean() })
