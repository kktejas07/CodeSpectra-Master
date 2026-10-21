import { AreaI18n } from '@/components/i18n/area-i18n'

// Interface strings for this area (lib/i18n/areas.ts); tests/i18n-app-areas.test.ts keeps the list complete.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AreaI18n ns={['practice', 'tools']}>{children}</AreaI18n>
}
