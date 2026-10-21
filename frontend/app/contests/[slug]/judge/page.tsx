/**
 * /contests/<slug>/judge — scoring screen for assigned judges (and staff).
 * Access is enforced by GET/POST /api/contests/[id]/judging.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHeader } from '@/components/app/page-kit'
import { JudgingTab } from '@/components/contests/judging'

export const dynamic = 'force-dynamic'

export default async function ContestJudgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <Link href={`/contests/${slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> Contest page</Link>
        <PageHeader title="Judge submissions" description="Score each entry’s latest submission on every rubric criterion. You can change your score until results are released." />
        <JudgingTab base={`/api/contests/${encodeURIComponent(slug)}`} released={false} />
      </div>
    </PublicPageWrapper>
  )
}
