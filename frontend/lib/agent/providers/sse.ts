/** Minimal Server-Sent Events reader shared by the provider adapters. */

export interface SseEvent {
  event: string | null
  data: string
}

/** Yield SSE events (event name + joined data lines) from a byte stream. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let event: string | null = null
  let data: string[] = []
  const flush = (): SseEvent | null => {
    if (data.length === 0) {
      event = null
      return null
    }
    const out = { event, data: data.join('\n') }
    event = null
    data = []
    return out
  }
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '')
        buf = buf.slice(nl + 1)
        if (line === '') {
          const ev = flush()
          if (ev) yield ev
          continue
        }
        if (line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon >= 0 ? line.slice(0, colon) : line
        let val = colon >= 0 ? line.slice(colon + 1) : ''
        if (val.startsWith(' ')) val = val.slice(1)
        if (field === 'event') event = val
        else if (field === 'data') data.push(val)
      }
    }
    buf += decoder.decode()
    if (buf.trim()) {
      for (const line of buf.split('\n')) {
        const l = line.replace(/\r$/, '')
        if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, ''))
        else if (l.startsWith('event:')) event = l.slice(6).trim()
      }
    }
    const last = flush()
    if (last) yield last
  } finally {
    try { reader.releaseLock() } catch { /* already released */ }
  }
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Tool-call argument text → object (models sometimes emit '' or invalid JSON). */
export function parseToolArgs(text: string | undefined | null): Record<string, unknown> {
  if (!text || !text.trim()) return {}
  const v = safeJsonParse(text)
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return { _invalid_json: text.slice(0, 2000) }
}
