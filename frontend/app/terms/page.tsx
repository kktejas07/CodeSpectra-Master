import { PublicPageWrapper } from '@/app/public-layout'

export default function TermsPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-2xl space-y-6 py-10 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-bold text-foreground">Terms of service</h1>
        <p>
          Placeholder terms: use of CodeSpectra is subject to acceptable use, account security, and payment terms where
          billing applies. API and dashboard access may be rate-limited or suspended for abuse.
        </p>
        <p>Replace with jurisdiction-specific terms reviewed by legal counsel before production.</p>
      </article>
    </PublicPageWrapper>
  )
}
