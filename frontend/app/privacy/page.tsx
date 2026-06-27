import { PublicPageWrapper } from '@/app/public-layout'

export default function PrivacyPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-2xl space-y-6 py-10 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-bold text-foreground">Privacy</h1>
        <p>
          CodeSpectra handles personal data responsibly: account identifiers from your
          auth provider, usage of features you enable, and optional integration tokens stored according to your
          organization policies.
        </p>
        <p>
          Replace this page with counsel-approved privacy text and a data subprocessors list before a public launch. Contact
          details belong in your legal entity footer.
        </p>
      </article>
    </PublicPageWrapper>
  )
}
