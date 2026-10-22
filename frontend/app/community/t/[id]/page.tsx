import { ThreadPage, threadMetadata } from '../../community-view'

export const dynamic = 'force-dynamic'
type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }) {
  return threadMetadata((await params).id, 'en')
}

export default async function Page({ params }: { params: Params }) {
  return <ThreadPage id={(await params).id} locale="en" />
}
