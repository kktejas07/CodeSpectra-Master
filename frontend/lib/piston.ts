/**
 * Piston code execution client.
 *
 * Piston is a free public sandbox at https://emkc.org/api/v2/piston that
 * runs code in 40+ languages. No auth required. Rate-limited per IP, so
 * we cache the runtime list aggressively.
 *
 * Self-hosting note: if you outgrow the public instance, set PISTON_URL
 * in .env.local to your own Docker deployment (https://github.com/engineer-man/piston).
 */

import { readServerSecrets } from '@/lib/server-secrets-cache'
import { isLocallySupported, localExecuteOnce } from '@/lib/local-executor'

/**
 * Resolve the active Piston URL. Priority:
 *   1. `piston_url` from MongoDB platform_settings (admin-configurable)
 *   2. `PISTON_URL` env var
 *   3. `null` → caller should fall back to the local executor
 */
async function resolvePistonUrl(): Promise<string | null> {
  try {
    const secrets = await readServerSecrets()
    const fromDb = secrets.piston_url?.trim()
    if (fromDb) return fromDb.replace(/\/+$/, '')
  } catch {
    /* ignore – the cache may not be warmed yet on a cold start */
  }
  const env = process.env.PISTON_URL?.trim()
  if (env) return env.replace(/\/+$/, '')
  return null
}

async function resolvePistonRunTimeout(): Promise<number> {
  try {
    const secrets = await readServerSecrets()
    const val = parseInt(secrets.piston_run_timeout_ms || '', 10)
    if (val > 0) return val
  } catch { /* fall through */ }
  const env = parseInt(process.env.PISTON_RUN_TIMEOUT_MS || '', 10)
  if (env > 0) return env
  return 5000
}

async function resolvePistonMaxConcurrent(): Promise<number> {
  try {
    const secrets = await readServerSecrets()
    const val = parseInt(secrets.piston_max_concurrent || '', 10)
    if (val > 0) return val
  } catch { /* fall through */ }
  const env = parseInt(process.env.PISTON_MAX_CONCURRENT || '', 10)
  if (env > 0) return env
  return 0 // 0 = unlimited
}

let _concurrentJobs = 0
const _pendingQueue: Array<{ resolve: () => void }> = []

async function acquireSlot(): Promise<void> {
  const max = await resolvePistonMaxConcurrent()
  if (max <= 0) return
  if (_concurrentJobs < max) {
    _concurrentJobs++
    return
  }
  return new Promise<void>((resolve) => {
    _pendingQueue.push({ resolve })
  })
}

function releaseSlot(): void {
  const maxVal = _concurrentJobs
  _concurrentJobs--
  if (_pendingQueue.length > 0) {
    const next = _pendingQueue.shift()!
    _concurrentJobs++
    next.resolve()
  }
}

export interface PistonRuntime {
  language: string
  version: string
  aliases: string[]
  runtime?: string
}

export interface PistonExecuteResult {
  language: string
  version: string
  run: {
    stdout: string
    stderr: string
    code: number | null
    signal: string | null
    output: string
  }
  compile?: {
    stdout: string
    stderr: string
    code: number | null
    signal: string | null
    output: string
  }
}

let _runtimes: PistonRuntime[] | null = null
let _runtimesAt = 0

export async function fetchRuntimes(): Promise<PistonRuntime[]> {
  // 5-minute in-memory cache
  if (_runtimes && Date.now() - _runtimesAt < 5 * 60 * 1000) return _runtimes
  const baseUrl = await resolvePistonUrl()
  if (!baseUrl) {
    _runtimes = []
    _runtimesAt = Date.now()
    return _runtimes
  }
  const res = await fetch(`${baseUrl}/runtimes`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Piston runtimes fetch failed: ${res.status}`)
  }
  _runtimes = (await res.json()) as PistonRuntime[]
  _runtimesAt = Date.now()
  return _runtimes
}

export async function resolveLanguageVersion(language: string): Promise<string | null> {
  try {
    const list = await fetchRuntimes()
    const lang = language.toLowerCase()
    const hit = list.find(
      (r) => r.language === lang || (r.aliases ?? []).includes(lang),
    )
    return hit?.version ?? null
  } catch {
    return null
  }
}

export interface ExecuteOptions {
  language: string
  source: string
  stdin?: string
  timeoutMs?: number
  version?: string
}

export async function executeOnce(opts: ExecuteOptions): Promise<PistonExecuteResult> {
  const baseUrl = await resolvePistonUrl()

  // No Piston configured → use local subprocess executor when possible.
  if (!baseUrl) {
    if (!isLocallySupported(opts.language)) {
      throw new Error(
        `No Piston server configured and language "${opts.language}" is not supported by the local executor. ` +
          `Configure piston_url in superadmin settings or use one of: python, javascript, typescript, bash.`,
      )
    }
    return localExecuteOnce(opts)
  }

  let version = opts.version
  if (!version) {
    try {
      version = (await resolveLanguageVersion(opts.language)) || undefined
    } catch {
      version = undefined
    }
  }
  if (!version) {
    // Piston is reachable but language is unknown — fall back to local if possible.
    if (isLocallySupported(opts.language)) return localExecuteOnce(opts)
    throw new Error(`Unsupported language: ${opts.language}`)
  }

  const timeoutMs = opts.timeoutMs ?? (await resolvePistonRunTimeout())

  const body = {
    language: opts.language,
    version,
    files: [{ name: filenameFor(opts.language), content: opts.source }],
    stdin: opts.stdin ?? '',
    run_timeout: timeoutMs,
    compile_timeout: Math.max(timeoutMs, 10000),
    run_memory_limit: 256 * 1024 * 1024, // 256 MB
  }

  await acquireSlot()
  let res: Response
  try {
    res = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    releaseSlot()
    // Network failure → degrade gracefully to local executor.
    if (isLocallySupported(opts.language)) return localExecuteOnce(opts)
    throw e
  }

  if (!res.ok) {
    releaseSlot()
    // Whitelist / quota errors are common on the public Piston instance — fall
    // back to local execution rather than hard-failing the user.
    if ((res.status === 401 || res.status === 403 || res.status === 429) &&
        isLocallySupported(opts.language)) {
      return localExecuteOnce(opts)
    }
    const txt = await res.text()
    throw new Error(`Piston execute failed: ${res.status} ${txt.slice(0, 200)}`)
  }
  releaseSlot()
  return (await res.json()) as PistonExecuteResult
}

function filenameFor(language: string): string {
  const map: Record<string, string> = {
    python: 'main.py',
    javascript: 'main.js',
    typescript: 'main.ts',
    java: 'Main.java',
    c: 'main.c',
    cpp: 'main.cpp',
    csharp: 'main.cs',
    go: 'main.go',
    rust: 'main.rs',
    ruby: 'main.rb',
    php: 'main.php',
    kotlin: 'Main.kt',
    swift: 'main.swift',
    bash: 'main.sh',
  }
  return map[language] || `main.${language}`
}
