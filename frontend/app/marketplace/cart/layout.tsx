import type { Metadata } from 'next'

export const metadata: Metadata = { title: { absolute: 'Your cart | CodeSpectra marketplace' }, robots: { index: false, follow: false } }

// Per-request rendering: the strict CSP stamps a fresh nonce (lib/csp/policy.ts).
export const dynamic = 'force-dynamic'

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children
}
