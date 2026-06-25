import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'

export default function ApiReferencePage() {
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-3xl space-y-10 py-8">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">Developers</p>
          <h1 className="text-4xl font-bold tracking-tight">API reference</h1>
          <p className="mt-3 text-muted-foreground">
            CodeSpectra exposes authenticated JSON routes under <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/*</code>.
            This page summarizes the main surfaces; open each route in your repo for request/response shapes.
          </p>
        </div>

        <section id="auth" className="scroll-mt-24 space-y-3 border-t border-border/60 pt-8">
          <h2 className="text-xl font-semibold">Authentication</h2>
          <p className="text-sm text-muted-foreground">
            Dashboard and most APIs expect a Supabase session (cookies). Use{' '}
            <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>{' '}
            from the app; server routes use <code className="text-xs">requireAuth()</code> where applicable.
          </p>
        </section>

        <section id="analyze" className="scroll-mt-24 space-y-3 border-t border-border/60 pt-8">
          <h2 className="text-xl font-semibold">Code analysis</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>
              <code className="text-foreground">POST /api/analyze-code</code> — submit source for analysis
            </li>
            <li>
              <code className="text-foreground">POST /api/generate-fixes</code> — AI-assisted fix suggestions
            </li>
            <li>
              <code className="text-foreground">GET /api/scanner/*</code> — scanner metrics and issues (session)
            </li>
          </ul>
        </section>

        <section id="webhooks" className="scroll-mt-24 space-y-3 border-t border-border/60 pt-8">
          <h2 className="text-xl font-semibold">Webhooks & integrations</h2>
          <p className="text-sm text-muted-foreground">
            GitHub OAuth and integration routes live under{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/github/*</code> and{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/integrations/*</code>. Configure redirect URLs in
            your provider console to match your deployment host.
          </p>
        </section>

        <p className="text-sm text-muted-foreground">
          <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
            Back to documentation
          </Link>
        </p>
      </div>
    </PublicPageWrapper>
  )
}
