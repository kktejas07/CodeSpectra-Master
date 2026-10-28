#!/usr/bin/env node
/**
 * CI gate for `yarn audit --groups dependencies --json` (SEC-028).
 * Fails on any high/critical advisory that is not on the accepted list below.
 * Each accepted entry has no fixed release on npm; remove it once it does.
 *
 *   yarn audit --groups dependencies --json | node scripts/audit-gate.mjs
 */
import { createInterface } from 'node:readline'

const ACCEPTED = new Map([
  ['GHSA-vfj7-8cjw-p6xm', 'braces ≤3.0.3 (via patch-package, build-time only) — no fixed release'],
  ['GHSA-86w9-cpqp-85rv', 'node-forge ≤1.4.0 (via @anon-aadhaar) — no fixed release; proofs are also bound server-side (SEC-026)'],
  // xlsx (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) removed in wave 5 — lib/xlsx-lite.ts (fflate) replaces it.
])

const seen = new Map()
const rl = createInterface({ input: process.stdin })
for await (const line of rl) {
  let d
  try { d = JSON.parse(line) } catch { continue }
  if (d.type !== 'auditAdvisory') continue
  const a = d.data.advisory
  if (a.severity !== 'high' && a.severity !== 'critical') continue
  seen.set(a.github_advisory_id, `${a.severity} ${a.module_name} ${a.vulnerable_versions} — ${a.title}`)
}
const fresh = [...seen].filter(([id]) => !ACCEPTED.has(id))
for (const [id, desc] of seen) console.log(`${ACCEPTED.has(id) ? 'accepted' : 'NEW     '} ${id} ${desc}`)
if (fresh.length) {
  console.error(`\n${fresh.length} new high/critical advisor${fresh.length === 1 ? 'y' : 'ies'} — upgrade or add a yarn resolution.`)
  process.exit(1)
}
console.log(`\nOK: ${seen.size} high/critical advisories, all accepted (no fixed release).`)
