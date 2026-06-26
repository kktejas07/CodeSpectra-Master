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
 */
export async function register() {
  // No-op. See module docstring.
  return
}
