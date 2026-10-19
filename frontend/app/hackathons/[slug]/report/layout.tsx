import { privateMetadata } from '@/lib/seo/metadata'

// Organiser report.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Hackathon report')

export default function HackathonsSlugReportLayout({ children }: { children: React.ReactNode }) {
  return children
}
