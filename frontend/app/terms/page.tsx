import { LegalShell, legalMetadata } from '@/components/public/legal-shell'
import { TermsBody } from './terms-body'

export const metadata = legalMetadata('/terms', 'en')

export default function TermsPage() {
  return (
    <LegalShell path="/terms" locale="en" updated="August 9, 2026">
      <TermsBody />
    </LegalShell>
  )
}
