import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'

export default function CareersPage() {
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <h1 className="text-4xl font-bold">Careers</h1>
        <p className="text-muted-foreground">
          We are not hiring for listed roles on this demo instance. For general inquiries, use{' '}
          <Link href="/contact" className="text-primary underline-offset-4 hover:underline">
            Contact
          </Link>
          .
        </p>
      </div>
    </PublicPageWrapper>
  )
}
