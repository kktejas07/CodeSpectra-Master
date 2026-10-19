/**
 * Deterministic local "embedder" for the OFFLINE evaluation only — never wired
 * into production. Hashed bag of stemmed words + character trigrams into a
 * fixed-size, L2-normalised vector, so the vector path, cosine, MIN_COSINE and
 * reciprocal rank fusion in lib/rag/search.ts can be exercised without an API key.
 *
 * It is a lexical proxy, not a semantic model: it rewards shared words and
 * shared word fragments (typos, plurals, compounds) but knows no synonyms, so
 * "hybrid (local)" numbers are a LOWER bound for hybrid with real embeddings.
 */
import { createHash } from 'crypto'
import { rawTokens, stem, ENGLISH_STOP_WORDS } from './stemmer'

export const LOCAL_EMBED_MODEL = 'local-hash-v1'
export const LOCAL_EMBED_DIMS = 512
const TRIGRAM_WEIGHT = 0.35

function bucket(feature: string): { i: number; sign: number } {
  const h = createHash('md5').update(feature).digest()
  return { i: h.readUInt32LE(0) % LOCAL_EMBED_DIMS, sign: h[4] & 1 ? 1 : -1 }
}

export function localEmbed(text: string): number[] {
  const tf = new Map<string, number>()
  for (const tok of rawTokens(text)) {
    if (ENGLISH_STOP_WORDS.has(tok)) continue
    const w = `w:${stem(tok)}`
    tf.set(w, (tf.get(w) ?? 0) + 1)
    const padded = `^${tok}$`
    for (let i = 0; i + 3 <= padded.length; i++) {
      const g = `g:${padded.slice(i, i + 3)}`
      tf.set(g, (tf.get(g) ?? 0) + 1)
    }
  }
  const v = new Array<number>(LOCAL_EMBED_DIMS).fill(0)
  for (const [f, n] of tf) {
    const { i, sign } = bucket(f)
    v[i] += sign * (1 + Math.log(n)) * (f.startsWith('w:') ? 1 : TRIGRAM_WEIGHT)
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

/** Switchable stand-in for lib/rag/embed (tests mock that module onto this). */
export const localEmbedder = {
  enabled: true,
  calls: 0,
  async availableEmbedModels(): Promise<string[]> {
    return this.enabled ? [LOCAL_EMBED_MODEL] : []
  },
  async embedTexts(texts: string[]): Promise<{ model: string; dims: number; vectors: number[][] } | null> {
    if (!this.enabled || !texts.length) return null
    this.calls++
    return { model: LOCAL_EMBED_MODEL, dims: LOCAL_EMBED_DIMS, vectors: texts.map(localEmbed) }
  },
}
