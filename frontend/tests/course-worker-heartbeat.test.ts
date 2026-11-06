/**
 * The course worker's liveness marker is what the admin UI reads to decide
 * "Worker Online". `WORKER_ONLINE_MS` is 20s, so the heartbeat has to keep
 * ticking *while* a job runs.
 *
 * 2026-11-06: it did not. `main()` called `await tick()` before ever creating
 * the `setInterval`, and `tick()` awaits `processVideoJob()`. So the first job
 * of every container ran to completion with exactly one heartbeat written
 * before the claim — the UI showed "Worker Offline" for hours while Chrome was
 * rendering at 90% CPU, and the "unstick" button offered to kill a healthy job.
 *
 * A source-order assertion is the cheapest honest guard: the failure mode is
 * ordering, and importing the script would start the real polling loop.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(
  path.resolve(__dirname, '..', 'scripts', 'course-video-worker.ts'),
  'utf8',
)

/** Index of the first real code line matching `re` (comments excluded). */
function codeLineIndex(re: RegExp): number {
  const lines = SRC.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue
    if (re.test(line)) return i
  }
  return -1
}

describe('course-video-worker liveness', () => {
  it('starts the heartbeat timer before awaiting the first job tick', () => {
    const heartbeatAt = codeLineIndex(/^setInterval\(beat,/)
    const firstTickAt = codeLineIndex(/^await tick\(\)$/)

    expect(heartbeatAt, 'no dedicated heartbeat timer found').toBeGreaterThan(-1)
    expect(firstTickAt, 'no first tick found').toBeGreaterThan(-1)
    // `await tick()` blocks until the whole job finishes — anything registered
    // after it never runs during that job.
    expect(heartbeatAt).toBeLessThan(firstTickAt)
  })

  it('does not await the heartbeat write inside the job loop', () => {
    // A slow/blocking write at the top of tick() delays job claiming; liveness
    // is the timer's job now.
    expect(SRC).not.toMatch(/await writeWorkerHeartbeat\(currentJobId\)/)
  })
})
