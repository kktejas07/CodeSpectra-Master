import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { LoadingWrapper } from '@/components/loading-wrapper'
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
