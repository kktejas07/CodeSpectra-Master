import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/lib/toast-context'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/lib/auth-context'
import './globals.css'

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
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
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
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          storageKey="codespectra-theme"
        >
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
