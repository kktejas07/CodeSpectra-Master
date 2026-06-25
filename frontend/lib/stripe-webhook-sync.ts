/**
 * Phase 7 stub — Stripe webhook → DB sync pending re-implementation against
 * MongoDB. The Stripe SDK + verification stays; only the DB writes need
 * porting to collections like `user_subscriptions` and `invoices`.
 */
const DEAD =
  'Stripe webhook sync is pending MongoDB re-implementation.'

export async function syncCheckoutSessionCompleted(..._args: unknown[]): Promise<void> {
  throw new Error(DEAD)
}
export async function syncSubscriptionFromStripe(..._args: unknown[]): Promise<void> {
  throw new Error(DEAD)
}
export async function syncInvoiceFromStripe(..._args: unknown[]): Promise<void> {
  throw new Error(DEAD)
}
