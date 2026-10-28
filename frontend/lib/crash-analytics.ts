/**
 * Crash Analytics — lightweight error / crash telemetry for CodeSpectra.
 *
 * Captures:
 *   • Unhandled JS exceptions (window.onerror)
 *   • Unhandled promise rejections
 *   • Manual error reports from components / API clients
 *   • Test failure records (called from test scaffolding in CI)
 *
 * Privacy: stack traces and error messages are sent to /api/crash-report
 * (a Next.js route handler).  No PII is attached by this module.
 *
 * ponytail: In production you'd swap the fetch call for a real APM vendor
 * (Sentry, Datadog RUM, etc.).  This keeps the same interface so the swap
 * is a one-liner.
 */

export type Severity = 'fatal' | 'error' | 'warning' | 'info'

export interface CrashEvent {
  /** Short machine-readable label, e.g. "UnhandledRejection" */
  type: string
  message: string
  severity: Severity
  /** ISO 8601 timestamp */
  timestamp: string
  /** Condensed stack (first 10 lines) */
  stack?: string
  /** Arbitrary structured context */
  context?: Record<string, unknown>
  /** Opaque session id — browser-generated, no PII */
  sessionId: string
}

// ── session id ────────────────────────────────────────────────────────────

let _sessionId: string | null = null

export function getSessionId(): string {
  if (_sessionId) return _sessionId
  try {
    const stored = sessionStorage.getItem('cs_crash_sid')
    if (stored) { _sessionId = stored; return stored }
  } catch { /* private window */ }
  _sessionId = typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  try { sessionStorage.setItem('cs_crash_sid', _sessionId) } catch { /* ok */ }
  return _sessionId
}

// ── transport ─────────────────────────────────────────────────────────────

const ENDPOINT = '/api/crash-report'
const MAX_STACK_LINES = 10

function trimStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  return stack.split('\n').slice(0, MAX_STACK_LINES).join('\n')
}

async function send(event: CrashEvent): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true, // survive page unload
    })
  } catch {
    // Never throw from crash reporting — swallow silently
  }
}

// ── public API ────────────────────────────────────────────────────────────

/**
 * Report an arbitrary error.  Safe to call from catch blocks; never throws.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
  severity: Severity = 'error',
): void {
  const err = error instanceof Error ? error : new Error(String(error))
  const event: CrashEvent = {
    type: err.name || 'Error',
    message: err.message,
    severity,
    timestamp: new Date().toISOString(),
    stack: trimStack(err.stack),
    context,
    sessionId: getSessionId(),
  }
  void send(event)
}

/**
 * Report an API call failure (status + url).
 */
export function reportApiError(
  url: string,
  status: number,
  body?: string,
): void {
  reportError(
    new Error(`HTTP ${status} on ${url}`),
    { url, status, responseBody: body?.slice(0, 500) },
    status >= 500 ? 'error' : 'warning',
  )
}

/**
 * Record a test failure (called from Vitest / Playwright reporters in CI).
 */
export function reportTestFailure(
  suiteName: string,
  testName: string,
  error: unknown,
): void {
  const err = error instanceof Error ? error : new Error(String(error))
  reportError(
    err,
    { suiteName, testName, environment: 'test' },
    'error',
  )
}

// ── global handlers (installed once) ─────────────────────────────────────

let _installed = false

/**
 * Install window-level handlers for unhandled errors and promise rejections.
 * Safe to call multiple times — installs only once.
 * Call this from `app/layout.tsx` or a `useEffect` at the root.
 */
export function installGlobalHandlers(): void {
  if (typeof window === 'undefined' || _installed) return
  _installed = true

  window.addEventListener('error', (ev: ErrorEvent) => {
    reportError(
      ev.error ?? new Error(ev.message),
      { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
      'fatal',
    )
  })

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    reportError(
      ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason)),
      { type: 'UnhandledRejection' },
      'error',
    )
  })
}

/**
 * Reset the global handler install flag (test helper only).
 * @internal
 */
export function _resetForTest(): void {
  _installed = false
  _sessionId = null
}
