/**
 * Phase 7 stub — billing server helpers pending re-implementation on
 * MongoDB. Stripe SDK calls were intertwined with Supabase row reads;
 * each function below now throws a clear error so callers fail fast.
 */
const DEAD =
  'Billing helpers were temporarily removed in the MongoDB migration. ' +
  'Re-implement using the `pricing_tiers`/`pricing_features` collections + Stripe SDK directly.'

export async function ensureDefaultPaymentMethod(
  ..._args: unknown[]
): Promise<unknown> {
  throw new Error(DEAD)
}
export async function getSubscriptionRow(..._args: unknown[]): Promise<unknown> {
  throw new Error(DEAD)
}
export async function composeSubscriptionResponse(
  ..._args: unknown[]
): Promise<unknown> {
  throw new Error(DEAD)
}
export async function completeCheckout(_params: unknown): Promise<unknown> {
  throw new Error(DEAD)
}
export async function cancelUserSubscription(
  ..._args: unknown[]
): Promise<unknown> {
  throw new Error(DEAD)
}
