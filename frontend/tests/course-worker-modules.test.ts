/**
 * The course worker runs this repo's TypeScript directly under `tsx`
 * (scripts/docker-entrypoint.sh with COURSE_WORKER=1), NOT under Next. Next
 * aliases the `server-only` marker package, and vitest.config.ts stubs it — so
 * a lib file that does `import 'server-only'` builds and tests perfectly green,
 * then dies on the first real generation with:
 *
 *   Cannot find module 'server-only'
 *   Require stack: - /app/lib/ai/usage-record.ts
 *
 * That is exactly what broke every lesson (2026-10-29). This test loads the
 * worker's hot modules in a real `tsx` process, where no alias exists.
 *
 * ponytail: one spawned tsx (~2s) instead of hand-rolling module resolution —
 * it is the only way to observe the worker's actual runtime.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FRONTEND = path.resolve(__dirname, '..')
const TSX_CLI = path.join(FRONTEND, 'node_modules', 'tsx', 'dist', 'cli.mjs')

/** Modules the worker pulls in while generating a lesson (static or dynamic). */
const WORKER_MODULES = [
  './lib/courses/process-job',
  './lib/courses/lesson-video',
  './lib/ai/usage-record',
  './lib/ai/cost-tracking',
]

describe('course worker runtime (plain tsx, no Next aliases)', () => {
  it('loads the worker module graph', () => {
    expect(existsSync(TSX_CLI), 'tsx is not installed — run yarn install').toBe(true)

    const imports = WORKER_MODULES.map(m => `import('${m}')`).join(',')
    const code =
      `Promise.all([${imports}]).then(() => console.log('WORKER_MODULES_OK'))` +
      `.catch(e => { console.error(e && e.message); process.exit(1) })`

    let stdout = ''
    try {
      stdout = execFileSync(process.execPath, [TSX_CLI, '--eval', code], {
        cwd: FRONTEND,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120_000,
      })
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string }
      throw new Error(
        'Worker modules must load under plain tsx (Next aliases `server-only`, tsx does not).\n' +
          `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`,
      )
    }

    expect(stdout).toContain('WORKER_MODULES_OK')
  }, 180_000)
})
