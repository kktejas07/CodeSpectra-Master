/**
 * /contests/<slug>/** (detail, workspace, judging): rendered per request, so
 * the interface language comes from the visitor's setting / browser and the
 * contest components read the compete area catalog (SEO-043). The cached
 * /contests hub (and /hi, /te copies) is outside this segment.
 */
import { LocaleRoot } from '@/components/i18n/locale-root'

export const dynamic = 'force-dynamic'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LocaleRoot areas={['compete']}>{children}</LocaleRoot>
}
