import type { Metadata } from 'next'
import { PRIVATE_PAGE_METADATA } from '@/lib/seo/metadata'

// Sign-in / sign-up / reset pages: thin and personal (reset tokens) — never indexed.
export const metadata: Metadata = { title: 'Sign in', ...PRIVATE_PAGE_METADATA }

/**
 * Auth section layout — intentionally a passthrough.
 * Individual `/auth/*` pages render their own split-screen / centered
 * layouts so this layer must NOT constrain width or centering.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
