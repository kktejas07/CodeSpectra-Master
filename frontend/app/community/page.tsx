import { CommunityHome, communityMetadata, type SP } from './community-view'

// Per request from the tag-purged data cache (lib/community/public-cache); the build has no DB.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return communityMetadata('en')
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return <CommunityHome locale="en" searchParams={searchParams} />
}
