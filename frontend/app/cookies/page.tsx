import { PublicPageWrapper } from '@/app/public-layout'

export default function CookiesPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-2xl space-y-6 py-10 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-bold text-foreground">Cookie notice</h1>
        <p>
          CodeSpectra uses cookies and similar storage for authentication sessions,
          theme preference, and product analytics where enabled.
        </p>
        <p>Expand this page with a cookie table, retention periods, and consent controls if you operate in regions that require it.</p>
      </article>
    </PublicPageWrapper>
  )
}
