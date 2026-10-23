/**
 * Fact checks for AI-written text against the facts it was given (pure, no I/O).
 *
 * Used by the digest verifier (AGT-034) and the tech-news fact verifier (AGT-031). A model
 * that rewrites or summarises may only repeat what the facts say:
 *
 *   numbers  every number (dates, prizes, counts; Devanagari / Telugu digits too) must be in the facts
 *   names    capitalised proper nouns / organisation names / acronyms (Latin script) must be in the facts
 *   claims   a short list of selling claims ("sponsored by", "beginner friendly", "free", "remote",
 *            "certificate", "hiring", ...) needs its key word in the facts
 *
 * Deliberately conservative: anything flagged falls back to a template (digest) or goes to a
 * human (news), so a false positive costs little and a false negative is what we guard against.
 */
import { unsupportedNumbers } from '@/lib/social/captions'

export { unsupportedNumbers }

/** Capitalised words that are fine without being in the facts (sentence starters, calendar words, our own brand). */
const COMMON = new Set(
  (
    'a an the this that these those it its is are was were be been being here there then now new today tomorrow ' +
    'join apply register sign learn read build try get see watch check find start explore meet win take make use ' +
    'and or but so if when while with without for from to of in on at by as about into over after before during ' +
    'you your we our they their he she his her i my me us them who what which why how where all any each every ' +
    'more most less other another some many much few both no not only also just very key top best big ' +
    'free online offline hybrid open closed live upcoming last next first second third final ' +
    'event events hackathon hackathons contest contests challenge challenges conference workshop webinar meetup ' +
    'job jobs internship internships news update updates article report story release launch announcement ' +
    'students student developers developer engineers engineer teams team participants winners prize prizes ' +
    'deadline registration registrations entries entry round rounds stage day days week weeks month months year years ' +
    'january february march april may june july august september october november december ' +
    'jan feb mar apr jun jul aug sep sept oct nov dec ' +
    'monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun ' +
    'am pm utc ist gmt ai ml api apis it ' +
    'codespectra'
  ).split(/\s+/).filter(Boolean),
)

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’']/g, "'")

/** Whole-word test on normalised text. */
function hasWord(haystack: string, word: string): boolean {
  const w = norm(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${w}(?=$|[^\\p{L}\\p{N}])`, 'u').test(haystack)
}

/**
 * Proper nouns in `text` that the facts don't mention. A run of capitalised words ("Google Cloud")
 * counts as one name; it passes when the whole run, or every word of it, is in the facts.
 * A single word at the start of a sentence ("Hurry", "Register") is only treated as a name when it
 * looks like one (acronym / CamelCase such as "AWS", "OpenAI"); a plain capitalised word there is just
 * English. (A sentence like "Google sponsors it." is still caught by unsupportedClaims.) Hashtags and
 * URLs are ignored. Pure.
 */
export function unsupportedNames(text: string, facts: string): string[] {
  const f = norm(facts)
  const body = text.replace(/https?:\/\/\S+/gi, ' ').replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
  // Latin-script capitalised tokens (incl. CamelCase like "OpenAI", acronyms like "AWS", "C++", ".NET").
  // A dot only continues a token when a letter/digit follows ("Node.js"), so "Hurry. Register" is two sentences.
  const re = /\b[A-Z](?:[\p{L}\p{N}&+-]|\.(?=[\p{L}\p{N}]))*(?:[ \t]+(?:(?:of|de|and|&|for)[ \t]+)?[A-Z](?:[\p{L}\p{N}&+-]|\.(?=[\p{L}\p{N}]))*)*/gu
  const out = new Set<string>()
  for (const m of body.matchAll(re)) {
    const run = m[0].replace(/[.-]+$/, '').trim()
    if (!run) continue
    const words = run.split(/\s+/).filter((w) => /^[A-Z]/.test(w))
    if (!words.length) continue
    if (hasWord(f, run)) continue
    const before = body.slice(0, m.index ?? 0)
    const sentenceStart = /(^|[.!?:;\n]\s*|["“(]\s*)$/.test(before) || /^\s*$/.test(before)
    if (sentenceStart && words.length === 1 && !/^[A-Z][\p{L}\p{N}]*[A-Z\p{N}+]/u.test(words[0])) continue
    const missing = words.filter((w) => !COMMON.has(norm(w)) && !hasWord(f, w))
    if (missing.length) out.add(words.length === 1 ? words[0] : run)
  }
  return [...out]
}

/** Claim phrases a model likes to add, keyed by the word(s) that must be in the facts for the claim to stand. */
const CLAIMS: { re: RegExp; needs: RegExp; label: string }[] = [
  { re: /\bsponsor(?:ed|s|ing)?\b/i, needs: /\bsponsor/i, label: 'sponsored' },
  { re: /\bpartner(?:ed|s|ing)? with\b|\bin partnership with\b/i, needs: /\bpartner/i, label: 'partnership' },
  { re: /\bbeginner[- ]friendly\b|\bno experience (?:needed|required)\b|\bfor beginners\b/i, needs: /\bbeginner|\bno experience|\bnovice|\bentry[- ]level/i, label: 'beginner friendly' },
  { re: /\bfree (?:to (?:join|enter|attend|register)|entry|registration|of (?:cost|charge))\b|\bno (?:entry |registration )?fee\b/i, needs: /\bfree\b|\bno (?:entry |registration )?fee/i, label: 'free' },
  { re: /\b(?:fully )?remote\b|\bwork from home\b/i, needs: /\bremote\b|\bonline\b|\bwork from home\b|\bvirtual\b/i, label: 'remote' },
  { re: /\bcertificates?\b|\bcertified\b/i, needs: /\bcertif/i, label: 'certificate' },
  { re: /\b(?:is |are )?hiring\b|\bjob offers?\b|\bpre-placement\b|\bppo\b/i, needs: /\bhir(?:e|ing)\b|\bjob\b|\bplacement|\bppo\b|\binternship/i, label: 'hiring' },
  { re: /\bguaranteed?\b/i, needs: /\bguarantee/i, label: 'guaranteed' },
  { re: /\bofficial(?:ly)?\b/i, needs: /\bofficial/i, label: 'official' },
  { re: /\bexclusive(?:ly)?\b/i, needs: /\bexclusive/i, label: 'exclusive' },
  { re: /\bbreaking\b/i, needs: /\bbreaking\b/i, label: 'breaking' },
  { re: /\bacquir(?:e|es|ed|ing)\b|\bacquisition\b/i, needs: /\bacqui/i, label: 'acquisition' },
  { re: /\blay(?:s|ing)? off\b|\blayoffs?\b/i, needs: /\blay(?:s|ing)? off\b|\blayoff/i, label: 'layoffs' },
]

/** Claims in `text` that the facts don't back (labels). Pure. */
export function unsupportedClaims(text: string, facts: string): string[] {
  return CLAIMS.filter((c) => c.re.test(text) && !c.needs.test(facts)).map((c) => c.label)
}

export interface FactCheck {
  ok: boolean
  numbers: string[]
  names: string[]
  claims: string[]
}

/** All three checks in one go. Pure. */
export function checkFacts(text: string, facts: string): FactCheck {
  const numbers = unsupportedNumbers(text, facts)
  const names = unsupportedNames(text, facts)
  const claims = unsupportedClaims(text, facts)
  return { ok: !numbers.length && !names.length && !claims.length, numbers, names, claims }
}
