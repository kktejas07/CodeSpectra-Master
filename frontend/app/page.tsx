import { LandingView, landingMetadata } from './landing-view'

// Rendered per request, never at build (the build has no DB). Data comes from
// the tag-purged data cache (lib/cache/public-data.ts), so the first request
// after a deploy fills it and later ones don't hit Mongo.
// Hindi / Telugu: app/[lang]/page.tsx (same view).
export const dynamic = 'force-dynamic'

export const metadata = landingMetadata('en')

export default function Home() {
  return <LandingView locale="en" />
}
