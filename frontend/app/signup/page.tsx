import { permanentRedirect } from 'next/navigation'

// Per-request rendering: the strict CSP stamps a fresh nonce (lib/csp/policy.ts).
export const dynamic = 'force-dynamic'

export default function SignupRedirect() {
  permanentRedirect('/auth/signup')
}
