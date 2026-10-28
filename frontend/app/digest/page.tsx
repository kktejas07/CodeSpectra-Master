/** /digest — the daily digest hub (latest digest + archive). Body: ./digest-view.tsx (shared with /hi/digest, /te/digest). */
import type { Metadata } from 'next'
import { DigestListView, digestListMetadata } from './digest-view'

// Per-request HTML from cached data (5 min, purged on publish); the build has no DB.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return digestListMetadata('en')
}

export default function DigestPage() {
  return <DigestListView locale="en" />
}
