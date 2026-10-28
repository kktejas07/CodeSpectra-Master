import { privateMetadata } from '@/lib/seo/metadata'
import { LocaleRoot } from '@/components/i18n/locale-root'

// Guardian invite / unsubscribe token pages: personal, never indexed.
export const metadata = privateMetadata('Guardian reports')

// Per-request rendering: the strict CSP stamps a fresh nonce (lib/csp/policy.ts).
export const dynamic = 'force-dynamic'

export default function GuardianLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleRoot areas={['account']}>
      <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
        <div className="mx-auto max-w-xl">{children}</div>
      </main>
    </LocaleRoot>
  )
}
