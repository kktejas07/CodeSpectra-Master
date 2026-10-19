/**
 * Offline RAG evaluation entry point:
 *
 *   npx tsx lib/rag/eval/run-offline.ts [--out <file.json>]
 *
 * Runs tests/rag-eval-offline.test.ts (which wires the real lib/rag pipeline to
 * an in-memory MongoDB + a local embedder via vitest module mocks — nothing in
 * production code is swapped), prints the metrics table and writes the full
 * JSON report (default: <os tmp>/rag-eval/offline.json).
 */
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const i = process.argv.indexOf('--out')
const out = path.resolve(i > 0 && process.argv[i + 1] ? process.argv[i + 1] : path.join(os.tmpdir(), 'rag-eval', 'offline.json'))
const root = path.resolve(__dirname, '../../..')

const res = spawnSync('npx', ['vitest', 'run', 'tests/rag-eval-offline.test.ts', '--reporter=dot'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RAG_EVAL_PRINT: '1', RAG_EVAL_OUT: out },
})
console.log(`\nFull report: ${out}`)
process.exit(res.status ?? 1)
