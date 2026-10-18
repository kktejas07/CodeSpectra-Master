/**
 * AI credits per agent turn: 1 credit per turn, plus 1 for every 4 tool calls
 * in that turn (a turn with 0–3 tool calls costs 1, 4–7 costs 2, 8 costs 3).
 * Charged only after a turn completes successfully (lib/user-credits
 * spendAiCredits); aborted or failed turns are free.
 */
export function creditsForTurn(toolCalls: number): number {
  const n = Number.isFinite(toolCalls) && toolCalls > 0 ? Math.floor(toolCalls) : 0
  return 1 + Math.floor(n / 4)
}
