/**
 * k6 load test: 1,000 concurrent candidates in one live drive.
 * NEVER run against production — the script refuses known production hosts.
 *
 *   1. Seed a drive on a local / staging stack:
 *        LOAD_TEST_DB=1 MONGODB_URI=mongodb://localhost:27017/codespectra \
 *          npx tsx scripts/load/live-drive-seed.ts --drive <driveId> --count 1000 --out /tmp/ld-tokens.json
 *      (the drive must exist and be scheduled; the seed creates loadtest users,
 *       adds them to the roster and writes bearer session tokens.)
 *   2. k6 run -e BASE_URL=http://localhost:3000 -e DRIVE_ID=<driveId> -e TOKENS=/tmp/ld-tokens.json \
 *        scripts/load/live-drive.k6.js
 *
 * Per virtual user: session → system check → start (waits for the shared
 * start) → paper → a save every AUTOSAVE seconds (heartbeat in between) for
 * WRITE_MIN minutes → submit. Bearer tokens skip the CSRF cookie (API auth).
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const DRIVE = __ENV.DRIVE_ID
const TOKENS = JSON.parse(open(__ENV.TOKENS || '/tmp/ld-tokens.json'))
const VUS = Number(__ENV.VUS || Math.min(1000, TOKENS.length))
const WRITE_MIN = Number(__ENV.WRITE_MIN || 10)
const AUTOSAVE = Number(__ENV.AUTOSAVE || 15)

const host = BASE.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
if (/(^|\.)codespectra\.(ai|com|in)$/i.test(host) || __ENV.ENVIRONMENT === 'production') {
  throw new Error(`Refusing to load-test ${host}: production. Use a local or staging stack.`)
}
if (!DRIVE) throw new Error('Set DRIVE_ID')

const saveLatency = new Trend('ld_save_ms', true)
const failed = new Rate('ld_failed')

export const options = {
  scenarios: {
    candidates: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: `${WRITE_MIN + 15}m` },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{op:save}': ['p(95)<800'],
    'http_req_duration{op:heartbeat}': ['p(95)<500'],
    'http_req_duration{op:paper}': ['p(95)<1500'],
    ld_failed: ['rate<0.01'],
  },
}

function post(token, body, op) {
  return http.post(`${BASE}/api/live-drives/${DRIVE}/session`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { op },
  })
}

export default function () {
  const token = TOKENS[(__VU - 1) % TOKENS.length]
  const auth = { headers: { Authorization: `Bearer ${token}` } }
  let r = http.get(`${BASE}/api/live-drives/${DRIVE}/session?answers=1`, { ...auth, tags: { op: 'session' } })
  if (!check(r, { 'session 200': (x) => x.status === 200 })) { failed.add(1); return }
  const s = r.json()
  post(token, { op: 'check', camera: true, mic: true, mbps: 20, browser_ok: true }, 'check')
  // Wait for the shared start (spread a little like real people).
  const wait = Date.parse(s.drive.schedule.start_at) - Date.parse(s.server_now)
  if (wait > 0) sleep(wait / 1000 + Math.random() * 20)
  r = post(token, { op: 'start' }, 'start')
  if (!check(r, { 'start 200': (x) => x.status === 200 })) { failed.add(1); return }
  r = http.get(`${BASE}/api/live-drives/${DRIVE}/paper`, { ...auth, tags: { op: 'paper' } })
  if (!check(r, { 'paper 200': (x) => x.status === 200 })) { failed.add(1); return }
  const ids = r.json().sections.flatMap((sec) => sec.questions.map((q) => q.id))
  let seq = 0
  const until = Date.now() + WRITE_MIN * 60_000
  while (Date.now() < until) {
    const q = ids[Math.floor(Math.random() * ids.length)]
    const res = post(token, { op: 'save', seq: ++seq, answers: { [q]: String.fromCharCode(65 + Math.floor(Math.random() * 4)) } }, 'save')
    saveLatency.add(res.timings.duration)
    failed.add(res.status !== 200)
    sleep(AUTOSAVE / 2)
    failed.add(post(token, { op: 'heartbeat' }, 'heartbeat').status !== 200)
    sleep(AUTOSAVE / 2)
  }
  r = post(token, { op: 'submit', seq: ++seq, answers: {} }, 'submit')
  failed.add(r.status !== 200)
}
