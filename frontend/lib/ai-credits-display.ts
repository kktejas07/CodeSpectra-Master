/**
 * How a credit balance is printed. Superadmins have no monthly cap and the API
 * returns a numeric sentinel (`Number.MAX_SAFE_INTEGER`) so server-side gate
 * checks stay simple — printing that sentinel gave the profile page
 * "9007199254740992" (2026-11-02). Unlimited renders as ∞; not loaded yet is …
 */
export function creditBalanceLabel(credits: { balance: number | null; unlimited?: boolean }): string {
  if (credits.unlimited) return '∞'
  return credits.balance === null ? '…' : String(credits.balance)
}
