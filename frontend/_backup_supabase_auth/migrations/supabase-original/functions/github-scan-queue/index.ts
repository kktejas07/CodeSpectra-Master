/**
 * Supabase Edge Function: forwards an authorized drain request to your CodeSpectra Next.js app.
 *
 * Deploy: `supabase functions deploy github-scan-queue --no-verify-jwt`
 * Secrets (Dashboard → Edge Functions → github-scan-queue → Secrets):
 *   - GITHUB_QUEUE_CRON_SECRET (same value as on the Next server)
 *   - CODESPECTRA_APP_URL (e.g. https://your-domain.com — no trailing slash required)
 *
 * Schedule: Supabase Dashboard → Edge Functions → Schedules → attach this function (e.g. every 5 minutes).
 */
Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('GITHUB_QUEUE_CRON_SECRET')?.trim()
  const appBase = Deno.env.get('CODESPECTRA_APP_URL')?.trim()
  if (!secret) {
    return new Response(JSON.stringify({ error: 'GITHUB_QUEUE_CRON_SECRET not set on function' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!appBase) {
    return new Response(JSON.stringify({ error: 'CODESPECTRA_APP_URL not set on function' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const limit = url.searchParams.get('limit') || '5'
  const target = `${appBase.replace(/\/$/, '')}/api/integrations/github/scan-queue/run?limit=${encodeURIComponent(limit)}`

  const upstream = await fetch(target, {
    method: 'POST',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
    },
  })

  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
  })
})
