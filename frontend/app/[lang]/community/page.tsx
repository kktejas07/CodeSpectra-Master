import { CommunityHome, communityMetadata, type SP } from '@/app/community/community-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return communityMetadata(await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: SP }) {
  return <CommunityHome locale={await langOf(params)} searchParams={searchParams} />
}
