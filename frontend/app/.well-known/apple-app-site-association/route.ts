/** CORE-043: iOS Universal Links + webcredentials, built from admin settings / env. 404 until configured. */
import { appLinksResponse, buildAppleAppSiteAssociation, loadAppLinksConfig } from '@/lib/mobile/app-links'

export const dynamic = 'force-dynamic'

export async function GET() {
  return appLinksResponse(buildAppleAppSiteAssociation(await loadAppLinksConfig()))
}
