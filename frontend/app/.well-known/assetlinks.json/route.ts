/** CORE-043: Android App Links, built from admin settings / env. 404 until configured. */
import { appLinksResponse, buildAssetLinks, loadAppLinksConfig } from '@/lib/mobile/app-links'

export const dynamic = 'force-dynamic'

export async function GET() {
  return appLinksResponse(buildAssetLinks(await loadAppLinksConfig()))
}
