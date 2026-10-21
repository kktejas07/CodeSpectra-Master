/** CTF dynamic scoring (pure, client-safe). */

/**
 * Dynamic value of a challenge after `solves` solves (CTFd's formula): the
 * first solver keeps the starting value, then it decays quadratically to
 * `min` at `decay` solves and stays there.
 */
export function ctfValue(initial: number, min: number, decay: number, solves: number): number {
  const init = Math.max(1, Number(initial) || 0)
  const lo = Math.max(0, Math.min(init, Number(min) || 0))
  const d = Math.max(1, Number(decay) || 1)
  const n = Math.max(0, Math.floor(Number(solves) || 0) - 1)
  const value = ((lo - init) / (d * d)) * (n * n) + init
  return Math.max(lo, Math.ceil(value))
}
