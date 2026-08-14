'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const EMAIL_WIDTH = 600

interface EmailPreviewFrameProps {
  html: string
  loading?: boolean
  className?: string
}

/**
 * Renders newsletter HTML at its native 600px email width, then scales it down
 * to fit the preview box width (CSS transform). Keeps the true email look
 * instead of reflowing, and never overflows the box horizontally. The box
 * height auto-sizes to the scaled email height so the whole email is visible.
 *
 * ponytail: assumes the email template is a fixed 600px design. If templates
 * ever become multi-width, pass the design width as a prop instead of a const.
 */
export default function EmailPreviewFrame({ html, loading, className }: EmailPreviewFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(0)

  const updateScale = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const available = Math.max(el.clientWidth, 1)
    setScale(available < EMAIL_WIDTH ? available / EMAIL_WIDTH : 1)
  }, [])

  useEffect(() => {
    updateScale()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateScale)
      if (containerRef.current) ro.observe(containerRef.current)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [updateScale])

  useEffect(() => { setContentHeight(0) }, [html])

  const handleLoad = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument
      const h = doc?.body?.scrollHeight || 0
      if (h) setContentHeight(h)
    } catch { /* same-origin srcDoc, not reachable in practice */ }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-[#f4f4f5] ${className || ''}`}
      style={{ height: contentHeight ? Math.round(contentHeight * scale) : 320 }}
    >
      <div style={{ width: EMAIL_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left', overflow: 'hidden' }}>
        {loading ? (
          <div className="flex items-center justify-center" style={{ width: EMAIL_WIDTH, height: 320 }}>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            title="Email preview"
            onLoad={handleLoad}
            className="border-0"
            style={{ width: EMAIL_WIDTH, height: contentHeight || 320, display: 'block' }}
          />
        )}
      </div>
    </div>
  )
}