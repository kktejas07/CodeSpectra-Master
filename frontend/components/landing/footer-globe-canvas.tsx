'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

function hslTripletToRgba(triplet: string, alpha: number): string {
  const parts = triplet
    .trim()
    .split(/\s+/)
    .map((p) => p.replace('%', ''))
  if (parts.length < 3) return `rgba(100,100,100,${alpha})`
  const h = Number(parts[0])
  const s = Number(parts[1])
  const l = Number(parts[2])
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) return `rgba(100,100,100,${alpha})`
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`
}

/**
 * Dot grid with a large Gaussian “highlight” that orbits slowly — reads like light
 * sweeping across a dotted sphere (marketing-style footer accent).
 */
export function FooterGlobeCanvas({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reducedMotion = () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    let t = 0
    let last = performance.now()
    const still = reducedMotion()

    const fg = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '240 10% 4%'

    const syncSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = wrap.getBoundingClientRect()
      w = Math.max(1, Math.floor(rect.width))
      h = Math.max(1, Math.floor(rect.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000)
      last = now
      if (!still) t += dt * 0.55

      const fgStr = fg()
      const spacing = Math.max(11, Math.min(15, Math.floor(Math.min(w, h) / 52)))

      const orbitRx = w * 0.34
      const orbitRy = h * 0.28
      const tt = still ? 0.9 : t
      const cx = w * 0.5 + Math.cos(tt) * orbitRx
      const cy = h * 0.42 + Math.sin(tt * 0.92) * orbitRy

      const cx2 = w * 0.52 + Math.cos(tt * 1.15 + 1.9) * (orbitRx * 0.72)
      const cy2 = h * 0.48 + Math.sin(tt * 1.05 + 1.2) * (orbitRy * 0.65)

      const R = Math.min(w, h) * 0.26
      const R2 = R * 0.55

      ctx.clearRect(0, 0, w, h)

      for (let x = 0; x <= w + spacing; x += spacing) {
        for (let y = 0; y <= h + spacing; y += spacing) {
          const dx = x - cx
          const dy = y - cy
          const d1sq = dx * dx + dy * dy
          const dx2 = x - cx2
          const dy2 = y - cy2
          const d2sq = dx2 * dx2 + dy2 * dy2

          const g1 = Math.exp(-d1sq / (R * R))
          const g2 = Math.exp(-d2sq / (R2 * R2))
          const boost = g1 + g2 * 0.55
          const tw = still ? 0 : 0.04 * Math.sin((x + y) * 0.02 + t * 2.2)
          const baseA = 0.07 + tw
          const a = Math.min(0.92, baseA + boost * 0.5)
          const rad = 0.65 + boost * 2.1

          ctx.fillStyle = hslTripletToRgba(fgStr, a)
          ctx.beginPath()
          ctx.arc(x, y, rad, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(draw)
    }

    const ro = new ResizeObserver(() => syncSize())
    ro.observe(wrap)
    syncSize()
    last = performance.now()
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full', className)}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
    </div>
  )
}
