/** Nearest-rank p75 (inclusive). */
export function percentile75(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil(0.75 * sorted.length) - 1
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))]
}
