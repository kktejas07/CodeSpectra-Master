import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import { LoadingWrapper } from '@/components/loading-wrapper'
import './globals.css'
import 'goey-toast/styles.css'
import 'driver.js/dist/driver.css'
import 'driver.js/dist/hints.css'
import './driver-tour.css'

export const dynamic = 'force-dynamic'

// Self-hosted JetBrains Mono (variable font, latin subset). Previously
// `next/font/google` which failed the Docker build when the server couldn't
// reach fonts.gstatic.com. The woff2 is a variable font covering 100–800.
const mono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  variable: '--font-mono',
  display: 'swap',
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

export const viewport = { width: 'device-width', initialScale: 1 }

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
        className="antialiased bg-background text-foreground font-sans"
        suppressHydrationWarning
      >
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var t = localStorage.getItem('theme') || 'dark';
                if (t === 'system') {
                  t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                document.documentElement.classList.add(t);
              })();
            `,
          }}
        />
        <Providers>
          <LoadingWrapper>{children}</LoadingWrapper>
        </Providers>
      </body>
    </html>
  )
}
