/**
 * Multi-replica course worker: extra replicas must actually add throughput.
 *
 * The claim used to bail out whenever ANY job was running anywhere
 * (`if (running) return null`), so replicas 2..N sat idle and scaling bought
 * nothing. Job liveness also had to become per-job (workers stamp
 * heartbeatAt every 4s) so one replica starting up can't steal healthy work
 * from its siblings, while a genuinely dead replica's job returns to the queue
 * in ~2 min instead of 3 hours.
 *
 * Run: npx vitest run tests/course-worker-claim.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  jobs: any[]
  heartbeat: Record<string, any> | null
  updates: Array<{ col: string; filter: any; set: any }>
  claimResult: any
} = { jobs: [], heartbeat: null, updates: [], claimResult: null }

vi.mock('@/lib/mongodb', () => {
  // Minimal matcher for the operators this module actually queries with.
  const matches = (doc: any, filter: any): boolean =>
    Object.entries(filter).every(([k, v]: [string, any]) => {
      if (k === '$or') return (v as any[]).some(sub => matches(doc, sub))
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('$lt' in v) return typeof doc[k] === 'string' && doc[k] < v.$lt
        if ('$exists' in v) return (doc[k] !== undefined) === v.$exists
        if ('$in' in v) return v.$in.includes(doc[k])
      }
      return doc[k] === v
    })
  return {
    getMongoDb: async () => ({
      collection: (col: string) => ({
        find: (filter: any = {}) => ({ toArray: async () => (col === 'generation_jobs' ? state.jobs : []).filter(d => matches(d, filter)) }),
        findOneAndUpdate: async () => state.claimResult,
        findOne: async () => null,
        updateOne: async (filter: any, update: any) => {
          state.updates.push({ col, filter, set: update.$set })
          return { ok: 1 }
        },
      }),
    }),
  }
})

import { claimNextPendingJob, requeueOrphanRunningJobs, writeWorkerHeartbeat, ORPHAN_JOB_MS } from '@/lib/courses/process-job'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

describe('multi-replica job claiming', () => {
  beforeEach(() => {
    state.jobs = []
    state.heartbeat = null
    state.updates = []
    state.claimResult = null
  })

  it('claims a pending job even while another job is running', async () => {
    state.jobs = [{ id: 'busy', status: 'running', heartbeatAt: new Date().toISOString() }]
    state.claimResult = { id: 'next', status: 'running' }

    await expect(claimNextPendingJob()).resolves.toEqual({ id: 'next' })
    // The healthy running job was not requeued.
    expect(state.updates.filter(u => u.col === 'generation_jobs')).toHaveLength(0)
  })

  it('requeues only jobs whose worker stopped beating', async () => {
    state.jobs = [
      { id: 'alive', status: 'running', heartbeatAt: new Date().toISOString() },
      { id: 'dead', status: 'running', heartbeatAt: ago(ORPHAN_JOB_MS + 60_000) },
    ]

    await expect(requeueOrphanRunningJobs()).resolves.toBe(1)
    const jobUpdates = state.updates.filter(u => u.col === 'generation_jobs')
    expect(jobUpdates).toHaveLength(1)
    expect(jobUpdates[0].filter).toEqual({ id: 'dead' })
    expect(jobUpdates[0].set.status).toBe('pending')
  })

  it('stamps the running job heartbeat so orphans are detected in ~2 min', async () => {
    await writeWorkerHeartbeat('job-1')
    const jobUpdate = state.updates.find(u => u.col === 'generation_jobs')
    expect(jobUpdate?.filter).toEqual({ id: 'job-1', status: 'running' })
    expect(Date.parse(jobUpdate!.set.heartbeatAt)).toBeGreaterThan(Date.now() - 5000)
  })
})
