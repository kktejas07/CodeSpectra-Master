import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'

export default function SecurityPage() {
  return (
    <PublicPageWrapper>
      <article className="mx-auto max-w-2xl space-y-6 py-10 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-bold text-foreground">Security</h1>
        <p>
          CodeSpectra is built around authenticated dashboards, role-based access, and OAuth for third parties when you
          connect them. Practice least privilege for API keys and rotate credentials used in deployment.
        </p>
        <p>
          For vulnerability reports, use the contact channel on the{' '}
          <Link href="/support" className="text-primary underline-offset-4 hover:underline">
            Support
          </Link>{' '}
          page. Do not post exploit details in public issues without coordination.
        </p>
        <p className="text-xs">
          This is informational copy for the marketing site, not a certification or audit report.
        </p>
      </article>
    </PublicPageWrapper>
  )
}
