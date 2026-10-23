/** Voice-note transcription with Deepgram (pre-recorded API). null = not configured / failed. */
export async function transcribeAudio(apiKey: string | null, audio: ArrayBuffer, mime: string, language: string, usage: { feature?: string; userId?: string; tenantId?: string | null } = {}): Promise<string | null> {
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
    const json = (await res.json().catch(() => ({}))) as { metadata?: { duration?: number }; results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
    // Speech is billed per audio minute (lib/ai/pricing); counts only, never the transcript.
    const seconds = Number(json.metadata?.duration) || 0
    if (seconds > 0) {
      void import('@/lib/ai/usage-record').then(({ recordAiUsage }) => {
        recordAiUsage({ feature: usage.feature || 'speech-to-text', provider: 'deepgram', model: 'nova-2', audioSeconds: seconds, kind: 'speech', userId: usage.userId, tenantId: usage.tenantId })
      }, () => undefined)
    }
    const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
    return text || null
  } catch {
    return null
  }
}
