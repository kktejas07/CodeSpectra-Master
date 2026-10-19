import type { BgvRegion } from '@/lib/ats/contract'
import type { BgvVendor } from './types'
import { manualVendor, simulatedVendor } from './simple'
import { checkrVendor } from './checkr'
import { authBridgeVendor, idfyVendor } from './india'

export * from './types'

export const VENDORS: Record<string, BgvVendor> = {
  manual: manualVendor,
  simulated: simulatedVendor,
  checkr: checkrVendor,
  authbridge: authBridgeVendor,
  idfy: idfyVendor,
}

export function getVendor(id: string | null | undefined): BgvVendor {
  return VENDORS[String(id || 'manual')] || manualVendor
}

export function vendorsFor(region: BgvRegion): { id: string; label: string; ready: boolean }[] {
  return Object.values(VENDORS).filter((v) => v.regions.includes(region)).map((v) => ({ id: v.id, label: v.label, ready: v.ready }))
}
