import type { Metadata } from 'next'
import { OfflinePractice } from '@/components/pwa/offline-practice'

/**
 * /offline — the installed app's offline screen (precached by public/sw.js and
 * served for any page that cannot load without a connection). The HTML is
 * generic; saved questions and queued answers come from IndexedDB on the device.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Offline practice',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-6">
      <OfflinePractice />
    </main>
  )
}
