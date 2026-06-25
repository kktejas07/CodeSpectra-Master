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

const PISTON_URL = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston'

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
  const res = await fetch(`${PISTON_URL}/runtimes`, {
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
  const version = opts.version || (await resolveLanguageVersion(opts.language))
  if (!version) {
    throw new Error(`Unsupported language: ${opts.language}`)
  }

  const body = {
    language: opts.language,
    version,
    files: [{ name: filenameFor(opts.language), content: opts.source }],
    stdin: opts.stdin ?? '',
    run_timeout: opts.timeoutMs ?? 5000,
    compile_timeout: 10000,
    run_memory_limit: 256 * 1024 * 1024, // 256 MB
  }

  const res = await fetch(`${PISTON_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Piston execute failed: ${res.status} ${txt.slice(0, 200)}`)
  }
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
