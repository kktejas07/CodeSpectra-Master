/**
 * Server layout for the signed-in app. Renders every dashboard page per
 * request: pages read the session client-side, many use useSearchParams
 * without a Suspense boundary, and the strict CSP stamps a fresh nonce on each
 * response (lib/csp/policy.ts). The sidebar, nav filters and shell live in
 * ./dashboard-shell.tsx (client component).
 */
import DashboardShell from './dashboard-shell'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
