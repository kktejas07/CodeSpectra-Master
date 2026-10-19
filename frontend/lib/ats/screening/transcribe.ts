/** Voice-note transcription with Deepgram (pre-recorded API). null = not configured / failed. */
export async function transcribeAudio(apiKey: string | null, audio: ArrayBuffer, mime: string, language: string): Promise<string | null> {
  if (!apiKey) return null
  const lang = /^en-(IN|US|GB|AU)$/.test(language) ? language : language.split('-')[0] || 'en'
  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=${encodeURIComponent(lang)}`, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mime.split(';')[0] || 'audio/ogg' },
      body: audio,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => ({}))) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
    const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
    return text || null
  } catch {
    return null
  }
}
