import type { Metadata } from 'next'
import { MentorView, mentorMetadata } from './mentor-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return mentorMetadata((await params).slug, 'en')
}

export default async function MentorPage({ params }: Props) {
  return <MentorView slug={(await params).slug} locale="en" />
}
