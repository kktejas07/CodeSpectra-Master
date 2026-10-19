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

export const DEMO_VENDOR_ID = 'simulated'

/**
 * The simulated vendor returns fake "verified" results, so it must never be
 * chosen for real hires (audit A-034): offered only outside production, or
 * when a superadmin turns on Admin → Settings → "Demo background-check vendor".
 */
export async function simulatedVendorAllowed(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true
  try {
    const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
    return (await getGeneralSettingsCached()).bgv_simulated_vendor === true
  } catch {
    return false
  }
}

export function vendorsFor(region: BgvRegion, opts: { allowSimulated?: boolean } = {}): { id: string; label: string; ready: boolean; demo?: boolean }[] {
  const allowSimulated = opts.allowSimulated ?? process.env.NODE_ENV !== 'production'
  return Object.values(VENDORS)
    .filter((v) => v.regions.includes(region) && (allowSimulated || v.id !== DEMO_VENDOR_ID))
    .map((v) => ({ id: v.id, label: v.label, ready: v.ready, ...(v.id === DEMO_VENDOR_ID ? { demo: true } : {}) }))
}
