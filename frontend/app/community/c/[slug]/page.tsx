import { CategoryView, categoryMetadata, type SP } from '../../community-view'

export const dynamic = 'force-dynamic'
type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }) {
  return categoryMetadata((await params).slug, 'en')
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: SP }) {
  return <CategoryView slug={(await params).slug} locale="en" searchParams={searchParams} />
}
