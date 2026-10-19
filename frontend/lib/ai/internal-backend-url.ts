/**
 * Where the FastAPI backend lives (server only). AGT-027: no baked-in
 * deployment hostname — production must set INTERNAL_BACKEND_URL (docker-compose
 * sets http://backend:8000). Development defaults to localhost:8001.
 */
export class InternalBackendConfigError extends Error {
  constructor() {
    super('INTERNAL_BACKEND_URL is not set. Set it to the backend service URL (e.g. http://backend:8000) — AI features are off until then.')
    this.name = 'InternalBackendConfigError'
  }
}

let warned = false

export function internalBackendUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = (env.INTERNAL_BACKEND_URL || '').trim().replace(/\/+$/, '')
  if (explicit) return explicit
  if (env.NODE_ENV === 'production' || env.COURSE_WORKER === '1') {
    if (!warned) {
      warned = true
      console.error('[ai] INTERNAL_BACKEND_URL is missing in production — AI calls will fail until it is set.')
    }
    throw new InternalBackendConfigError()
  }
  return 'http://localhost:8001'
}
