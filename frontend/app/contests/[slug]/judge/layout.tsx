import { privateMetadata } from '@/lib/seo/metadata'

// Judges only (the API checks the judge list): noindex.
export const metadata = privateMetadata('Judge contest')

export default function ContestJudgeLayout({ children }: { children: React.ReactNode }) {
  return children
}
