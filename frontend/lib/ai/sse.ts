/**
 * Collect the assistant's text from `/api/ai/chat`'s SSE stream
 * (`data: {"delta": "…"}` chunks, `data: [DONE]` last).
 *
 * The chat route streams; callers that did `res.json()` got a parse error and
 * showed "Network error" while the model had answered (problem-page AI mentor,
 * 2026-11-04).
 */
export async function readSseText(res: Response): Promise<string> {
  const text = await res.text()
  let out = ''
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    let parsed: { delta?: string; error?: string } | null = null
    try {
      parsed = JSON.parse(payload) as { delta?: string; error?: string }
    } catch {
      continue
    }
    if (parsed?.error) throw new Error(parsed.error)
    if (parsed?.delta) out += parsed.delta
  }
  return out.trim()
}
