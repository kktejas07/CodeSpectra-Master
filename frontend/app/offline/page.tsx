import type { Metadata } from 'next'
import { OfflinePractice } from '@/components/pwa/offline-practice'
import { LocaleRoot } from '@/components/i18n/locale-root'
import { getServerI18n } from '@/lib/i18n/server'

/**
 * /offline — the installed app's offline screen (precached by public/sw.js and
 * served for any page that cannot load without a connection). The HTML is
 * generic; saved questions and queued answers come from IndexedDB on the device.
 * It renders in the interface language at the time the service worker cached it.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n()
  return { title: t('public.offlineTitle'), robots: { index: false, follow: false } }
}

export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-6">
      <LocaleRoot>
        <OfflinePractice />
      </LocaleRoot>
    </main>
  )
}
