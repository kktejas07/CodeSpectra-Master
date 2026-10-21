import type { Metadata } from 'next'
import { NotFoundView } from '@/components/public/not-found-view'

// Rendered inside the [lang] layout, so the Hindi / Telugu provider is active.
export const metadata: Metadata = { title: 'Page not found' }

export default function LocalizedNotFound() {
  return <NotFoundView />
}
