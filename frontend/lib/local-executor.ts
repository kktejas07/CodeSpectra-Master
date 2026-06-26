/**
 * Local in-process code executor (Piston API shape compatible).
 *
 * Used as a fallback when an external Piston instance is not configured. We
 * shell out via `child_process.spawn` with strict resource limits:
 *
 *   - stdin is piped from the caller
 *   - stdout/stderr captured up to 256 KiB each (truncated past that)
 *   - run_timeout enforced via kill('SIGKILL')
 *   - each process runs in a temp dir that is removed after exit
 *
 * Supported languages (interpreters that are already in the container):
 *   - python  (python3)
 *   - javascript / node
 *   - typescript (via npx tsx)  [only if tsx is on PATH]
 *   - bash / sh
 *
 * This is NOT a sandbox. It runs in-process; do not expose to untrusted
 * code. The submissions route gates this via Better Auth, but for high-risk
 * usage you should set `PISTON_URL` to a real Piston container.
 */
import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ExecuteOptions, PistonExecuteResult } from './piston'

interface LanguageSpec {
  ext: string
  command: (filePath: string) => { cmd: string; args: string[] }
  version: string
}

const SUPPORTED: Record<string, LanguageSpec> = {
  python: {
    ext: 'py',
    version: 'local-python3',
    command: (f) => ({ cmd: 'python3', args: [f] }),
  },
  python3: {
    ext: 'py',
    version: 'local-python3',
    command: (f) => ({ cmd: 'python3', args: [f] }),
  },
  javascript: {
    ext: 'js',
    version: 'local-node',
    command: (f) => ({ cmd: 'node', args: [f] }),
  },
  node: {
    ext: 'js',
    version: 'local-node',
    command: (f) => ({ cmd: 'node', args: [f] }),
  },
  typescript: {
    ext: 'ts',
    version: 'local-tsx',
    command: (f) => ({ cmd: 'npx', args: ['--yes', 'tsx', f] }),
  },
  bash: {
    ext: 'sh',
    version: 'local-bash',
    command: (f) => ({ cmd: 'bash', args: [f] }),
  },
  sh: {
    ext: 'sh',
    version: 'local-sh',
    command: (f) => ({ cmd: 'sh', args: [f] }),
  },
}

const MAX_OUTPUT_BYTES = 256 * 1024

export function isLocallySupported(language: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUPPORTED, language.toLowerCase())
}

export function localSupportedLanguages(): string[] {
  return Object.keys(SUPPORTED)
}

function truncate(buf: Buffer): string {
  if (buf.length <= MAX_OUTPUT_BYTES) return buf.toString('utf8')
  return buf.slice(0, MAX_OUTPUT_BYTES).toString('utf8') + '\n... [truncated]'
}

export async function localExecuteOnce(
  opts: ExecuteOptions,
): Promise<PistonExecuteResult> {
  const spec = SUPPORTED[opts.language.toLowerCase()]
  if (!spec) {
    throw new Error(`Local executor: unsupported language "${opts.language}"`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'cs-exec-'))
  const filePath = join(dir, `main.${spec.ext}`)
  await writeFile(filePath, opts.source, 'utf8')

  const { cmd, args } = spec.command(filePath)
  const timeoutMs = Math.max(500, Math.min(15000, opts.timeoutMs ?? 5000))

  return new Promise<PistonExecuteResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: {
        // strip secrets that the running code shouldn't see
        PATH: process.env.PATH || '',
        HOME: dir,
        LANG: 'C.UTF-8',
      },
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let totalOut = 0
    let totalErr = 0

    child.stdout.on('data', (chunk: Buffer) => {
      totalOut += chunk.length
      if (totalOut <= MAX_OUTPUT_BYTES) stdoutChunks.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      totalErr += chunk.length
      if (totalErr <= MAX_OUTPUT_BYTES) stderrChunks.push(chunk)
    })

    if (opts.stdin) {
      try {
        child.stdin.write(opts.stdin)
      } catch {
        /* writer may already be closed if the program exited immediately */
      }
    }
    try {
      child.stdin.end()
    } catch {
      /* ignore */
    }

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      const stdout = truncate(Buffer.concat(stdoutChunks))
      const stderr = truncate(Buffer.concat(stderrChunks))
      void rm(dir, { recursive: true, force: true })
      resolve({
        language: opts.language,
        version: spec.version,
        run: {
          stdout,
          stderr,
          code,
          signal: signal ?? null,
          output: stdout + stderr,
        },
      })
    }

    child.on('error', (err) => {
      // ENOENT, etc.
      stderrChunks.push(Buffer.from(`spawn error: ${err.message}\n`))
      finish(null, null)
    })
    child.on('close', (code, signal) => finish(code, signal as NodeJS.Signals | null))
  })
}
