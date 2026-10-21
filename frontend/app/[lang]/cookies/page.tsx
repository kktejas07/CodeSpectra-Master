import { LegalShell, legalMetadata } from '@/components/public/legal-shell'
import { CookiesBody } from '@/app/cookies/cookies-body'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export async function generateMetadata({ params }: { params: LangParams }) {
  return legalMetadata('/cookies', await langOf(params))
}

// Translated title and note; the legal text stays English (see LegalShell).
export default async function Page({ params }: { params: LangParams }) {
  return (
    <LegalShell path="/cookies" locale={await langOf(params)} updated="August 9, 2026">
      <CookiesBody />
    </LegalShell>
  )
}
