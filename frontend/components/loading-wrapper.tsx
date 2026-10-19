'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { LoadingScreen } from '@/components/loading-screen'

/**
 * Splash on a hard load of the signed-in app only. Public pages render
 * straight away so their content is the Largest Contentful Paint (SEO-002).
 */
export function LoadingWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const [loading, setLoading] = useState(() => pathname.startsWith('/dashboard'))
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current || !loading) return
    shown.current = true
    const timer = setTimeout(() => setLoading(false), 800)
    const observer = new MutationObserver(() => {
      if (document.querySelector('main')?.children.length) {
        setLoading(false)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const stop = setTimeout(() => observer.disconnect(), 5000)
    return () => { clearTimeout(timer); clearTimeout(stop); observer.disconnect() }
    // First hard load only: the splash never re-appears on client navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
      {children}
    </>
  )
}
