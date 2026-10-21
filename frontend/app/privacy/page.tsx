import { LegalShell, legalMetadata } from '@/components/public/legal-shell'
import { PrivacyBody } from './privacy-body'

export const metadata = legalMetadata('/privacy', 'en')

export default function PrivacyPage() {
  return (
    <LegalShell path="/privacy" locale="en" updated="August 9, 2026">
      <PrivacyBody />
    </LegalShell>
  )
}
