import { CommunityI18n } from '@/components/community/community-i18n'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export default async function Layout({ children, params }: { children: React.ReactNode; params: LangParams }) {
  return <CommunityI18n areas={['community']} locale={await langOf(params)}>{children}</CommunityI18n>
}
