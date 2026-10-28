import { ContestsView } from './contests-view'

// Rendered per request, never at build (the build has no DB). Data comes from
// the tag-purged data cache (lib/cache/public-data.ts), so the first request
// after a deploy fills it and later ones don't hit Mongo. Metadata: ./layout.tsx.
export const dynamic = 'force-dynamic'

export default function ContestsPage() {
  return <ContestsView locale="en" />
}
