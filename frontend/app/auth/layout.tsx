import type { Metadata } from 'next'
import { PRIVATE_PAGE_METADATA } from '@/lib/seo/metadata'
import { LocaleRoot } from '@/components/i18n/locale-root'

// Sign-in / sign-up / reset pages: thin and personal (reset tokens) — never indexed.
export const metadata: Metadata = { title: 'Sign in', ...PRIVATE_PAGE_METADATA }

// Per-request rendering: the strict CSP stamps a fresh nonce (lib/csp/policy.ts).
export const dynamic = 'force-dynamic'

/**
 * Auth section layout — intentionally a passthrough.
 * Individual `/auth/*` pages render their own split-screen / centered
 * layouts so this layer must NOT constrain width or centering.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot>{children}</LocaleRoot>
}
