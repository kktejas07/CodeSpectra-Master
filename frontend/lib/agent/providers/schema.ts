/**
 * Contract JsonSchema → each provider's tool-parameter format.
 *
 * - OpenAI-compatible + Anthropic take standard JSON Schema. Only the contract
 *   subset is emitted — some OpenAI-compatible gateways reject unknown keywords.
 * - Gemini takes an OpenAPI 3 subset: upper-case types, string-only enums, no
 *   maxLength; constraints it can't express are folded into the description.
 */
import type { JsonSchema } from '@/lib/agent/contract'

/** Standard JSON Schema (contract subset only). */
export function toJsonSchema(s: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: s.type }
  if (s.description) out.description = s.description
  if (s.enum) out.enum = [...s.enum]
  if (s.minimum !== undefined) out.minimum = s.minimum
  if (s.maximum !== undefined) out.maximum = s.maximum
  if (s.maxLength !== undefined) out.maxLength = s.maxLength
  if (s.maxItems !== undefined) out.maxItems = s.maxItems
  if (s.type === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties ?? {})) props[k] = toJsonSchema(v)
    out.properties = props
    if (s.required?.length) out.required = s.required.filter((r) => r in props)
  }
  if (s.type === 'array') out.items = s.items ? toJsonSchema(s.items) : { type: 'string' }
  return out
}

const GEMINI_TYPE: Record<JsonSchema['type'], string> = {
  object: 'OBJECT',
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
}

/** Gemini functionDeclarations.parameters (OpenAPI subset). */
export function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: GEMINI_TYPE[s.type] }
  const notes: string[] = []
  if (s.enum) {
    if (s.type === 'string') out.enum = s.enum.map(String)
    else notes.push(`One of: ${s.enum.join(', ')}.`)
  }
  if (s.minimum !== undefined) out.minimum = s.minimum
  if (s.maximum !== undefined) out.maximum = s.maximum
  if (s.maxItems !== undefined) out.maxItems = String(s.maxItems) // int64 → string in proto JSON
  if (s.maxLength !== undefined) notes.push(`At most ${s.maxLength} characters.`)
  const description = [s.description, ...notes].filter(Boolean).join(' ')
  if (description) out.description = description
  if (s.type === 'object') {
    const entries = Object.entries(s.properties ?? {})
    if (entries.length) {
      const props: Record<string, unknown> = {}
      for (const [k, v] of entries) props[k] = toGeminiSchema(v)
      out.properties = props
      const req = (s.required ?? []).filter((r) => r in props)
      if (req.length) out.required = req
    }
  }
  if (s.type === 'array') out.items = s.items ? toGeminiSchema(s.items) : { type: 'STRING' }
  return out
}

/** True when an object schema has no parameters (Gemini wants `parameters` omitted then). */
export function isEmptyObjectSchema(s: JsonSchema): boolean {
  return s.type === 'object' && Object.keys(s.properties ?? {}).length === 0
}
