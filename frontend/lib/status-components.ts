/**
 * One source of truth for the public status components.
 *
 * `/api/status` (read) and `/api/cron/status-check` (write) each used to build
 * their own list, and the labels drifted: the writer kept "Database (MongoDB)",
 * "Code Execution (Piston)" and "Using local executor" long after the reader was
 * neutralised, so every new check re-introduced the leak (2026-11-02).
 *
 * Rules:
 *  - no vendor names, no sandbox/implementation details, no "which provider is
 *    configured" — this data is served on a public page;
 *  - probe the sandbox through resolvePistonUrl() (the platform setting the
 *    grader uses), not an env var that is unset in Docker.
 */
import { getMongoDb } from '@/lib/mongodb'
import { resolvePistonUrl } from '@/lib/piston'

export type StatusValue = 'operational' | 'degraded' | 'down'
export interface StatusComponent {
  name: string
  status: StatusValue
  latency?: number
}

export async function buildStatusComponents(): Promise<StatusComponent[]> {
  const components: StatusComponent[] = []

  // Database
  const dbStart = Date.now()
  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    components.push({ name: 'Database', status: 'operational', latency: Date.now() - dbStart })
  } catch {
    components.push({ name: 'Database', status: 'down' })
  }

  // API (we are answering this request)
  components.push({ name: 'API', status: 'operational' })

  // Code execution sandbox
  const sandboxStart = Date.now()
  try {
    const url = await resolvePistonUrl()
    if (!url) {
      components.push({ name: 'Code execution', status: 'degraded' })
    } else {
      const res = await fetch(`${url}/runtimes`, { signal: AbortSignal.timeout(5000) })
      components.push({
        name: 'Code execution',
        status: res.ok ? 'operational' : 'degraded',
        latency: Date.now() - sandboxStart,
      })
    }
  } catch {
    components.push({ name: 'Code execution', status: 'degraded' })
  }

  // Email delivery — presence of a provider, never which one.
  const mailConfigured = Boolean(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.POSTAL_API_KEY)
  components.push({ name: 'Email delivery', status: mailConfigured ? 'operational' : 'degraded' })

  return components
}

export function overallStatusOf(components: StatusComponent[]): StatusValue {
  if (components.some((c) => c.status === 'down')) return 'down'
  return components.every((c) => c.status === 'operational') ? 'operational' : 'degraded'
}

/** Historical rows written before the neutral labels must not leak on read. */
const NEUTRAL_NAMES: [RegExp, string][] = [
  [/database|mongo/i, 'Database'],
  [/api/i, 'API'],
  [/piston|code execution|sandbox/i, 'Code execution'],
  [/email/i, 'Email delivery'],
]

export function neutralName(name: unknown): string {
  const raw = String(name ?? '')
  for (const [re, label] of NEUTRAL_NAMES) if (re.test(raw)) return label
  return 'Service'
}

/** Strip names and messages from a stored log row. */
export function sanitizeStatusLog<T extends { components?: unknown }>(log: T): T {
  if (!log || !Array.isArray(log.components)) return log
  return {
    ...log,
    components: (log.components as Record<string, unknown>[]).map((c) => ({
      name: neutralName(c?.name),
      status: c?.status,
      latency: c?.latency,
    })),
  }
}
