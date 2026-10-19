/**
 * Name on ID vs account name (audit A-005).
 *
 * The old check passed when ANY one name part appeared on the ID, so a shared
 * surname was enough. This compares normalised name TOKENS:
 *
 *   normalise: Unicode NFKD, strip accents, lowercase, punctuation → space,
 *              drop honorifics (mr, mrs, ms, dr, shri, smt, kumari, s/o, d/o …).
 *
 * Tolerance (documented, deliberately small):
 *   - order does not matter ("Chintakayala Krishna" == "Krishna Chintakayala");
 *   - an initial matches a full token with that first letter ("K Krishna"),
 *     common on Indian IDs — but initials never count as a FULL match;
 *   - one OCR slip is forgiven per token of 5+ letters (edit distance ≤ 1);
 *   - extra tokens on the ID (middle name, father's name) are allowed.
 *
 * Verdict:
 *   match      — every account token is matched AND at least min(2, n) of them
 *                are full (non-initial) matches;
 *   partial    — all but one account token matched with ≥1 full match, or
 *                everything matched only via initials → send to identity review;
 *   mismatch   — anything less (e.g. only the surname is shared).
 */

const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'shri', 'sri', 'smt', 'kumari', 'km', 'master',
  'so', 'do', 'wo', 'co', 'son', 'daughter', 'wife', 'of',
])

export function normaliseNameTokens(name: string): string[] {
  if (!name) return []
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b([sdwc])\s*\/\s*o\b/g, ' ') // s/o, d/o, w/o, c/o
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !HONORIFICS.has(t))
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (la > lb) i++
    else if (lb > la) j++
    else { i++; j++ }
  }
  return edits + (la - i) + (lb - j) <= 1
}

type TokenHit = 'full' | 'initial' | null

function matchToken(accountTok: string, idToks: string[], used: Set<number>): TokenHit {
  // Prefer exact / fuzzy full matches, then initials.
  for (let k = 0; k < idToks.length; k++) {
    if (used.has(k)) continue
    const t = idToks[k]
    if (t.length > 1 && accountTok.length > 1 &&
      (t === accountTok || (Math.min(t.length, accountTok.length) >= 5 && editDistanceAtMost1(t, accountTok)))) {
      used.add(k)
      return 'full'
    }
  }
  for (let k = 0; k < idToks.length; k++) {
    if (used.has(k)) continue
    const t = idToks[k]
    if ((t.length === 1 || accountTok.length === 1) && t[0] === accountTok[0]) {
      used.add(k)
      return 'initial'
    }
  }
  return null
}

export type NameMatchVerdict = 'match' | 'partial' | 'mismatch'

export function compareNames(idName: string, accountName: string): NameMatchVerdict {
  const acc = normaliseNameTokens(accountName)
  const id = normaliseNameTokens(idName)
  if (acc.length === 0 || id.length === 0) return 'mismatch'
  const used = new Set<number>()
  let full = 0, initial = 0, missed = 0
  for (const a of acc) {
    const hit = matchToken(a, id, used)
    if (hit === 'full') full++
    else if (hit === 'initial') initial++
    else missed++
  }
  const needFull = Math.min(2, acc.length)
  if (missed === 0 && full >= needFull) return 'match'
  if (missed === 0 && full >= 1) return 'partial'
  if (missed === 1 && acc.length >= 3 && full >= 2) return 'partial'
  if (missed === 1 && acc.length === 2 && full === 1 && id.length === 1) return 'partial' // ID shows a single name
  return 'mismatch'
}

/** Two OCR reads of the same card agree (used to confirm a genuine mismatch). */
export function namesAgree(a: string, b: string): boolean {
  return compareNames(a, b) !== 'mismatch' || compareNames(b, a) !== 'mismatch'
}
