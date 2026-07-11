'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { LoadingScreen } from '@/components/loading-screen'

function LoadingWatcher({ onPathChange }: { onPathChange: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const prevPath = useRef('')

  useEffect(() => {
    const current = pathname + (searchParams?.toString() || '')
    if (prevPath.current && prevPath.current !== current) {
      onPathChange()
    }
    prevPath.current = current
  }, [pathname, searchParams, onPathChange])

  return null
}

export function LoadingWrapper({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const timer = setTimeout(() => setLoading(false), 800)
    const observer = new MutationObserver(() => {
      if (document.querySelector('main')?.children.length) {
        setLoading(false)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 5000)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [])

  const onPathChange = () => setLoading(true)

  return (
    <>
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
      {mounted && (
        <Suspense fallback={null}>
          <LoadingWatcher onPathChange={onPathChange} />
        </Suspense>
      )}
      {children}
    </>
  )
}
