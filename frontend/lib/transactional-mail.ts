import { getServerSecretsFromCache, warmServerSecretsCache } from '@/lib/server-secrets-cache'

export async function sendEmailViaPostal(params: {
  to: string
  subject: string
  html: string
  text?: string
  cc?: string
}): Promise<{ messageId: number | null }> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const server = (process.env.POSTAL_SERVER?.trim() || s.postal_server?.trim()) ?? ''
  const apiKey = (process.env.POSTAL_API_KEY?.trim() || s.postal_api_key?.trim()) ?? ''
  const from = (process.env.POSTAL_FROM_EMAIL?.trim() || s.postal_from_email?.trim()) ?? ''
  if (!server || !apiKey || !from) {
    throw new Error(
      'Postal is not configured: add Server URL, API key, and From address under Platform settings → Integrations, or set POSTAL_SERVER, POSTAL_API_KEY, POSTAL_FROM_EMAIL in the server environment.'
    )
  }

  const url = `${server.replace(/\/+$/, '')}/api/v1/send/message`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Server-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [params.to],
      ...(params.cc ? { cc: [params.cc] } : {}),
      from,
      subject: params.subject,
      html_body: params.html,
      ...(params.text ? { text_body: params.text } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Postal API error (${res.status}): ${body || res.statusText}`)
  }

  const data = await res.json()
  return { messageId: data.id ?? null }
}
