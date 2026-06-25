'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type AnimatedDotCanvasProps = {
  className?: string
  /** Dot spacing in CSS pixels (smaller = denser) */
  spacing?: number
}

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
 * Quiet diagonal “paper” dot field — same idea as the canvas band on
 * Uniform grid, slow drift, no connection lines (clean marketing-band look).
 */
export function AnimatedDotCanvas({ className, spacing = 22 }: AnimatedDotCanvasProps) {
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
    let phase = 0
    let last = performance.now()
    const still = reducedMotion()

    const fg = () => {
      const root = getComputedStyle(document.documentElement)
      return root.getPropertyValue('--foreground').trim() || '240 10% 4%'
    }

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
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (!still) {
        phase = (phase + dt * 20) % spacing
      }

      ctx.clearRect(0, 0, w, h)
      const fgStr = fg()
      const dotR = 1.05
      ctx.fillStyle = hslTripletToRgba(fgStr, 0.2)

      const px = still ? 0 : phase
      const py = still ? 0 : phase * 0.55

      for (let x = -spacing; x < w + spacing; x += spacing) {
        for (let y = -spacing; y < h + spacing; y += spacing) {
          const cx = x + px
          const cy = y + py
          ctx.beginPath()
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(draw)
    }

    const ro = new ResizeObserver(() => {
      syncSize()
    })
    ro.observe(wrap)
    syncSize()
    last = performance.now()
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [spacing])

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full', className)}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
    </div>
  )
}
