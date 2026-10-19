/**
 * India vendor adapter skeletons — AuthBridge and IDfy. NOT wired: both need
 * a commercial agreement and API credentials from the vendor (sandbox +
 * production base URLs, auth scheme, the check codes in your contract, and
 * their callback signature scheme). Until then, manual verification works for
 * every India check (verifiers mark each check in the BGV panel).
 *
 * To implement one: store its keys next to the Checkr keys (settings.ts
 * VendorSecrets), map our check types to the vendor's check codes, POST the
 * candidate + documents (readDocument in storage.ts gives the decrypted
 * bytes), keep the vendor's order id as vendor_report_ref, add a webhook route
 * like app/api/ats/bgv/webhooks/checkr that verifies the vendor's signature,
 * and map its per-check verdicts to verified / discrepancy / unable_to_verify.
 */
import type { BgvCheckType } from '@/lib/ats/contract'
import { VendorError, type BgvVendor } from './types'

const IN_CHECKS: BgvCheckType[] = ['identity', 'pan', 'aadhaar', 'address', 'education', 'employment', 'uan_epfo', 'court_record', 'criminal', 'reference']

function skeleton(id: string, label: string): BgvVendor {
  return {
    id,
    label: `${label} (needs vendor API access)`,
    regions: ['IN'],
    supports: IN_CHECKS,
    ready: false,
    async order() {
      throw new VendorError(id, `${label} isn't connected yet — it needs API access from ${label}. Use manual verification for now.`, 400)
    },
    async getStatus() {
      return { done: false, checks: [] }
    },
  }
}

export const authBridgeVendor = skeleton('authbridge', 'AuthBridge')
export const idfyVendor = skeleton('idfy', 'IDfy')
