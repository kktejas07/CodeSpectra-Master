import Link from 'next/link'
import { SoftGlow } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <SoftGlow />
      <Illustration name="not-found" className="mb-6 w-56" />
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        The link may be old or mistyped. If you were opening an assessment or certificate, check the link in your email.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="rounded-full px-6">
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full px-6">
          <Link href="/support">Get help</Link>
        </Button>
      </div>
    </main>
  )
}
