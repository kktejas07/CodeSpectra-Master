/**
 * Snowball English (Porter2) stemmer + MongoDB-style English tokenising (pure).
 *
 * Used by the offline evaluation's in-memory `$text` emulation so keyword
 * scores behave like MongoDB's English text index (which stems with Snowball
 * and drops English stop words), and by the deterministic local embedder.
 * Not used by production search.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])
const isV = (c: string | undefined) => !!c && VOWELS.has(c)
const DOUBLES = ['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt']
const LI_ENDINGS = new Set(['c', 'd', 'e', 'g', 'h', 'k', 'm', 'n', 'r', 't'])

const EXCEPTIONS: Record<string, string> = {
  skis: 'ski', skies: 'sky', dying: 'die', lying: 'lie', tying: 'tie', idly: 'idl', gently: 'gentl',
  ugly: 'ugli', early: 'earli', only: 'onli', singly: 'singl', sky: 'sky', news: 'news', howe: 'howe',
  atlas: 'atlas', cosmos: 'cosmos', bias: 'bias', andes: 'andes',
}
const EXCEPTIONS_1A = new Set(['inning', 'outing', 'canning', 'herring', 'earring', 'proceed', 'exceed', 'succeed'])

function regions(w: string): { r1: number; r2: number } {
  const after = (start: number): number => {
    for (let i = start + 1; i < w.length; i++) if (!isV(w[i]) && isV(w[i - 1])) return i + 1
    return w.length
  }
  let r1: number
  if (w.startsWith('gener') || w.startsWith('arsen')) r1 = 5
  else if (w.startsWith('commun')) r1 = 6
  else r1 = after(0)
  const r2 = after(r1)
  return { r1, r2 }
}

function endsShortSyllable(w: string): boolean {
  const n = w.length
  if (n === 2) return isV(w[0]) && !isV(w[1])
  if (n >= 3) {
    const [a, b, c] = [w[n - 3], w[n - 2], w[n - 1]]
    return !isV(a) && isV(b) && !isV(c) && c !== 'w' && c !== 'x' && c !== 'Y'
  }
  return false
}

const isShort = (w: string, r1: number) => r1 >= w.length && endsShortSyllable(w)
const hasVowel = (s: string) => [...s].some(isV)

function longest(w: string, suffixes: readonly string[]): string | null {
  let best: string | null = null
  for (const s of suffixes) if (w.endsWith(s) && (!best || s.length > best.length)) best = s
  return best
}

const STEP2: Record<string, string> = {
  tional: 'tion', enci: 'ence', anci: 'ance', abli: 'able', entli: 'ent', izer: 'ize', ization: 'ize',
  ational: 'ate', ation: 'ate', ator: 'ate', alism: 'al', aliti: 'al', alli: 'al', fulness: 'ful',
  ousli: 'ous', ousness: 'ous', iveness: 'ive', iviti: 'ive', biliti: 'ble', bli: 'ble', ogi: 'og',
  fulli: 'ful', lessli: 'less', li: '',
}
const STEP3: Record<string, string> = {
  tional: 'tion', ational: 'ate', alize: 'al', icate: 'ic', iciti: 'ic', ical: 'ic', ful: '', ness: '', ative: '',
}
const STEP4 = ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement', 'ment', 'ent', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize', 'ion']

export function stem(input: string): string {
  let w = input.toLowerCase()
  if (w.length <= 2) return w
  if (EXCEPTIONS[w]) return EXCEPTIONS[w]
  if (w[0] === "'") w = w.slice(1)
  // Mark consonant-y.
  let chars = [...w]
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === 'y' && (i === 0 || isV(chars[i - 1]))) chars[i] = 'Y'
  }
  w = chars.join('')
  const { r1, r2 } = regions(w)

  // Step 0
  const s0 = longest(w, ["'s'", "'s", "'"])
  if (s0) w = w.slice(0, -s0.length)

  // Step 1a
  const s1a = longest(w, ['sses', 'ied', 'ies', 'us', 'ss', 's'])
  if (s1a === 'sses') w = w.slice(0, -2)
  else if (s1a === 'ied' || s1a === 'ies') w = w.length > 4 ? w.slice(0, -2) : w.slice(0, -1)
  else if (s1a === 's') {
    if (hasVowel(w.slice(0, -2))) w = w.slice(0, -1)
  }
  if (EXCEPTIONS_1A.has(w)) return w

  // Step 1b
  const s1b = longest(w, ['eed', 'eedly', 'ed', 'edly', 'ing', 'ingly'])
  if (s1b === 'eed' || s1b === 'eedly') {
    if (w.length - s1b.length >= r1) w = w.slice(0, -s1b.length) + 'ee'
  } else if (s1b) {
    const stemPart = w.slice(0, -s1b.length)
    if (hasVowel(stemPart)) {
      w = stemPart
      if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e'
      else if (DOUBLES.some((d) => w.endsWith(d))) w = w.slice(0, -1)
      else if (isShort(w, r1)) w += 'e'
    }
  }

  // Step 1c
  if (w.length > 2 && (w.endsWith('y') || w.endsWith('Y')) && !isV(w[w.length - 2])) w = w.slice(0, -1) + 'i'

  // Step 2
  const s2 = longest(w, Object.keys(STEP2))
  if (s2 && w.length - s2.length >= r1) {
    if (s2 === 'ogi') { if (w[w.length - 4] === 'l') w = w.slice(0, -3) + 'og' }
    else if (s2 === 'li') { if (LI_ENDINGS.has(w[w.length - 3])) w = w.slice(0, -2) }
    else w = w.slice(0, -s2.length) + STEP2[s2]
  }

  // Step 3
  const s3 = longest(w, Object.keys(STEP3))
  if (s3 && w.length - s3.length >= r1) {
    if (s3 === 'ative') { if (w.length - 5 >= r2) w = w.slice(0, -5) }
    else w = w.slice(0, -s3.length) + STEP3[s3]
  }

  // Step 4
  const s4 = longest(w, STEP4)
  if (s4 && w.length - s4.length >= r2) {
    if (s4 === 'ion') { const c = w[w.length - 4]; if (c === 's' || c === 't') w = w.slice(0, -3) }
    else w = w.slice(0, -s4.length)
  }

  // Step 5
  if (w.endsWith('e')) {
    const base = w.slice(0, -1)
    if (w.length - 1 >= r2 || (w.length - 1 >= r1 && !endsShortSyllable(base))) w = base
  } else if (w.endsWith('l') && w.length - 1 >= r2 && w[w.length - 2] === 'l') {
    w = w.slice(0, -1)
  }
  chars = [...w]
  return chars.map((c) => (c === 'Y' ? 'y' : c)).join('')
}

/** MongoDB's English stop words (the list shipped with the server's text index). */
export const ENGLISH_STOP_WORDS: ReadonlySet<string> = new Set((
  'a about above after again against all am an and any are aren\'t as at be because been before being below between ' +
  'both but by can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each few for ' +
  'from further had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him ' +
  'himself his how how\'s i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most ' +
  'mustn\'t my myself no nor not of off on once only or other ought our ours ourselves out over own same shan\'t she ' +
  'she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs them themselves then there ' +
  'there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up very was wasn\'t ' +
  'we we\'d we\'ll we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom ' +
  'why why\'s with won\'t would wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves ' +
  's t d ll m re ve just now will also may might must shall us'
).split(' '))

/** Lower-case, strip diacritics, split on anything that isn't a letter or digit (MongoDB's delimiters). */
export function rawTokens(text: string): string[] {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Tokens as MongoDB's English text index sees them: no stop words, stemmed. */
export function textIndexTerms(text: string): string[] {
  return rawTokens(text).filter((t) => !ENGLISH_STOP_WORDS.has(t)).map(stem)
}
