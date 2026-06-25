import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'

export default function BlogPage() {
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <h1 className="text-4xl font-bold">Blog</h1>
        <p className="text-muted-foreground">
          Product updates and engineering notes will appear here. For now, see{' '}
          <Link href="/docs" className="text-primary underline-offset-4 hover:underline">
            Documentation
          </Link>{' '}
          or{' '}
          <Link href="/faq" className="text-primary underline-offset-4 hover:underline">
            FAQ
          </Link>
          .
        </p>
      </div>
    </PublicPageWrapper>
  )
}
