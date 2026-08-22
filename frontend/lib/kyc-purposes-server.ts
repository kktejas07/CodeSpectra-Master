/**
 * Load KYC purpose routing from platform_settings.kyc_providers.
 */
import { getMongoDb } from '@/lib/mongodb'
import { mergeKycPurposes, type KycPurposeConfig } from '@/lib/kyc-purposes'

export async function getKycPurposeConfig(): Promise<KycPurposeConfig> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'kyc_providers' })
    return mergeKycPurposes(doc?.value || {})
  } catch {
    return mergeKycPurposes({})
  }
}
