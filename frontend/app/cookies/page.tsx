import { LegalShell, legalMetadata } from '@/components/public/legal-shell'
import { CookiesBody } from './cookies-body'

export const metadata = legalMetadata('/cookies', 'en')

export default function CookiesPage() {
  return (
    <LegalShell path="/cookies" locale="en" updated="August 9, 2026">
      <CookiesBody />
    </LegalShell>
  )
}
