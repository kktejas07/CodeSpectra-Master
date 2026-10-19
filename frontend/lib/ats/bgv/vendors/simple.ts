/**
 * 'manual' (no vendor: verifiers mark every check) and 'simulated' (tests /
 * demos: on the next scheduler sweep every ordered check completes as
 * verified — or, when the candidate's email contains "+consider", the first
 * critical check comes back as a discrepancy).
 */
import type { BgvVendor, VendorContext } from './types'
import { CATALOG } from '../catalog'

export const manualVendor: BgvVendor = {
  id: 'manual',
  label: 'Manual verification',
  regions: ['IN', 'US'],
  supports: [],
  ready: true,
  async order() {
    return { checks: [] }
  },
  async getStatus() {
    return { done: false, checks: [] }
  },
}

const ALL = [...new Set([...CATALOG.IN, ...CATALOG.US].map((c) => c.type))]

export const simulatedVendor: BgvVendor = {
  id: 'simulated',
  label: 'Simulated vendor (demo)',
  regions: ['IN', 'US'],
  supports: ALL,
  ready: true,
  async order(ctx: VendorContext) {
    const ref = `sim_${ctx.case.id.slice(0, 8)}`
    return { candidate_ref: ref, report_ref: `${ref}_r`, checks: ctx.case.checks.filter((k) => k.status !== 'waived').map((k) => k.type) }
  },
  async getStatus(ctx: VendorContext) {
    const consider = /\+consider/i.test(ctx.case.candidate_email || '')
    const flagged = consider ? ctx.case.checks.find((k) => ctx.case.critical_checks.includes(k.type))?.type : undefined
    return {
      done: true,
      checks: ctx.case.checks
        .filter((k) => k.status === 'in_progress')
        .map((k) => ({
          type: k.type,
          status: k.type === flagged ? ('discrepancy' as const) : ('verified' as const),
          // Every result says DEMO so it can't be mistaken for a real check.
          notes: k.type === flagged ? 'DEMO result (simulated vendor, not a real check): discrepancy' : 'DEMO result (simulated vendor, not a real check): verified',
        })),
    }
  },
}
