import { CommunityI18n } from '@/components/community/community-i18n'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CommunityI18n areas={['community']} locale="en">{children}</CommunityI18n>
}
