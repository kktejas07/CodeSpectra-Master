import type { Metadata } from 'next'

// Personal signed link: never indexed, never leaked through the Referer header.
export const metadata: Metadata = {
  title: 'Compensation details',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function HrFormLayout({ children }: { children: React.ReactNode }) {
  return children
}
