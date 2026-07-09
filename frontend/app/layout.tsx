import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

export const dynamic = 'force-dynamic'

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'CodeSpectra - Master Code Through AI',
  description:
    'CodeSpectra: Real-time code analysis, competitive challenges, and AI-powered learning for developers',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable}`}
    >
      <body
        className="antialiased bg-background text-foreground font-mono"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
