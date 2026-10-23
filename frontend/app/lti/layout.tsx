/** LTI landing pages (opened from Moodle / another LMS): per request, interface language from the profile / cookie. */
import { LocaleRoot } from '@/components/i18n/locale-root'
import { privateMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

// SEO-022: launch tokens must never be indexed (robots also disallows /lti/).
export const metadata = privateMetadata('Continue from your course')

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot areas={['community']}><main className="min-h-screen bg-background px-4 py-10">{children}</main></LocaleRoot>
}
