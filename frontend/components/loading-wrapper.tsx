'use client'

import { useEffect, useState, useRef } from 'react'
import { LoadingScreen } from '@/components/loading-screen'

export function LoadingWrapper({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current) return
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
  }, [])

  return (
    <>
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
      {children}
    </>
  )
}
