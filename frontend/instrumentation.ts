/**
 * Next.js boot hook (runs once per server process, before any route handler).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We intentionally keep this file dependency-free. The in-process scheduler
 * lives in `lib/scheduler.ts` and pulls in the MongoDB driver, which can't
 * be bundled for the Edge runtime — so importing it directly from here
 * causes the dev/edge build to fail.
 *
 * Instead, the scheduler boots lazily on the FIRST hit to any API route via
 * `lib/boot-scheduler.ts` (called from `lib/api-auth.ts`). For serverless
 * deployments the existing `vercel.json` cron entry hits `/api/cron/tick`
 * every minute, which also works as a fallback in any environment.
 *
 * SEC-018: a production server refuses to start without its own encryption
 * keys. Without them, API keys, TOTP secrets, face templates and ID photos are
 * sealed with a key derived from SESSION_SECRET — which is stored in Mongo, so a
 * database dump alone would decrypt everything. Set SECRETS_ENCRYPTION_KEY (and
 * optionally IDENTITY_MEDIA_KEY), 32+ random chars each, in the deployment
 * secret store. Existing data stays readable (legacy key is kept for reads and
 * re-sealed). Emergency override: ALLOW_DERIVED_ENCRYPTION_KEYS=1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return
  // Mask secrets/tokens in every server log line (lib/log-redact).
  if (process.env.LOG_REDACTION !== '0') {
    const { installConsoleRedaction } = await import('./lib/log-redact')
    installConsoleRedaction()
  }
  if (process.env.NODE_ENV !== 'production') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const missing: string[] = []
  const secrets = (process.env.SECRETS_ENCRYPTION_KEY || '').trim()
  if (secrets.length < 32) missing.push('SECRETS_ENCRYPTION_KEY')
  if ((process.env.IDENTITY_MEDIA_KEY || secrets).trim().length < 32) missing.push('IDENTITY_MEDIA_KEY')
  if (!missing.length) return
  const msg = `[security] ${missing.join(' and ')} not set (32+ chars). Refusing to start in production — see docs/devops/05-Production-Checklist.md.`
  if (process.env.ALLOW_DERIVED_ENCRYPTION_KEYS === '1') {
    console.error(msg.replace('Refusing to start', 'ALLOW_DERIVED_ENCRYPTION_KEYS=1 — starting anyway'))
    return
  }
  console.error(msg)
  throw new Error(msg)
}
