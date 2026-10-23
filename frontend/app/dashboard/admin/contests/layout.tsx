/** Admin contest pages use the shared contest components (leaderboard, judging), translated in the compete area (SEO-043). */
import { AreaI18n } from '@/components/i18n/area-i18n'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AreaI18n ns={['compete']}>{children}</AreaI18n>
}
