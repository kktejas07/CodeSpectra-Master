import type { Metadata } from 'next'
import { NotFoundView } from '@/components/public/not-found-view'

// Next adds noindex to 404 responses itself. Hindi / Telugu: app/[lang]/not-found.tsx.
export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return <NotFoundView />
}
