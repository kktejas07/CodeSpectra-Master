import { AreaI18n } from '@/components/i18n/area-i18n'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AreaI18n ns={['community']}>{children}</AreaI18n>
}
