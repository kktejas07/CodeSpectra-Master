/**
 * Auth section layout — intentionally a passthrough.
 * Individual `/auth/*` pages render their own split-screen / centered
 * layouts so this layer must NOT constrain width or centering.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
