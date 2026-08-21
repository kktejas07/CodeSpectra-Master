/**
 * Parse ID-OCR model JSON. A name with no `is_id_card: true` is treated as a
 * face-guess (vision models invent names from selfies) and discarded.
 */
export type IdOcrResult = { isIdCard: boolean; name: string }

export function parseIdOcrPayload(content: string): IdOcrResult {
  const empty: IdOcrResult = { isIdCard: false, name: '' }
  if (!content || typeof content !== 'string') return empty
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) return empty
  try {
    const parsed = JSON.parse(m[0]) as { is_id_card?: unknown; isIdCard?: unknown; name?: unknown }
    const isIdCard = parsed.is_id_card === true || parsed.isIdCard === true
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    return { isIdCard, name: isIdCard ? name : '' }
  } catch {
    return empty
  }
}
