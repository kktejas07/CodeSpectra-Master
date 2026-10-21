import { PublicPageWrapper } from '@/app/public-layout'
import { ContestWorkspace } from '@/components/contests/workspace'

export const dynamic = 'force-dynamic'

export default async function ContestWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <PublicPageWrapper>
      <ContestWorkspace slug={slug} />
    </PublicPageWrapper>
  )
}
