'use client'

/**
 * 3D dot globe — projection & layout after Louis Hoebregts (Mamboleoo):
 * https://codepen.io/Mamboleoo/pen/rNzYPjq
 * Themed for light/dark via CSS variables; fills use rgba for Canvas compatibility.
 */

import { useEffect, useRef, useCallback } from 'react'

function hslStringToRgba(hslStr: string, alpha: number): string {
  const match = hslStr.match(/hsla?\(\s*([^)]+)\s*\)/i)
  if (!match) return `rgba(148, 163, 184, ${alpha})`

  let inner = match[1].trim()
  let baseAlpha = 1

  if (inner.includes('/')) {
    const [colorPart, alphaPart] = inner.split('/').map((p) => p.trim())
    inner = colorPart
    baseAlpha = parseFloat(alphaPart) || 1
  }

  let h: number
  let s: number
  let l: number

  if (inner.includes(',')) {
    const parts = inner.split(',').map((p) => parseFloat(p.trim()))
    h = parts[0]
    s = parts[1]
    l = parts[2]
    if (parts.length > 3) baseAlpha = parts[3] || baseAlpha
  } else {
    const tokens = inner.split(/\s+/).filter(Boolean)
    h = parseFloat(tokens[0])
    s = parseFloat(tokens[1])
    l = parseFloat(tokens[2])
  }

  if ([h, s, l].some((n) => Number.isNaN(n))) {
    return `rgba(148, 163, 184, ${alpha})`
  }

  const hue = ((h % 360) + 360) % 360
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) {
    r = c
    g = x
    b = 0
  } else if (hue < 120) {
    r = x
    g = c
    b = 0
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const rr = Math.round((r + m) * 255)
  const gg = Math.round((g + m) * 255)
  const bb = Math.round((b + m) * 255)
  const a = Math.min(1, Math.max(0, alpha * baseAlpha))
  return `rgba(${rr}, ${gg}, ${bb}, ${a})`
}

function parseRgbTuple(s: string): [number, number, number] {
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (!m) return [148, 163, 184]
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]
}

function mixRgba(fg: string, primary: string, t: number, alpha: number): string {
  const [r1, g1, b1] = parseRgbTuple(fg)
  const [r2, g2, b2] = parseRgbTuple(primary)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface Globe3DProps {
  className?: string
  /** Number of dots on the sphere (CodePen default 1000). */
  particleCount?: number
  /** Base dot radius before perspective (CodePen default 4). */
  dotRadius?: number
  /** Multiplier applied to `time` for auto-rotation (CodePen uses 0.0004). */
  rotationSpeed?: number
  /** Globe radius as a fraction of canvas width (CodePen uses 0.7). */
  radiusFactor?: number
  /** Field of view scale vs width (CodePen uses 0.8). */
  fieldOfViewFactor?: number
  interactive?: boolean
  /** When true, canvas fills its parent (no max width/height — use for hero backgrounds). */
  fillContainer?: boolean
}

export function Globe3D({
  className = '',
  particleCount = 1000,
  dotRadius = 4,
  rotationSpeed = 0.00012,
  radiusFactor = 0.7,
  fieldOfViewFactor = 0.8,
  interactive = false,
  fillContainer = false,
}: Globe3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const dragRotationRef = useRef(0)
  const isDraggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })

  const getThemeColors = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        primary: 'hsl(217, 91%, 60%)',
        foreground: 'hsl(0, 0%, 98%)',
      }
    }
    const computedStyle = getComputedStyle(document.documentElement)
    const isDark = document.documentElement.classList.contains('dark')
    const primary = computedStyle.getPropertyValue('--primary').trim()
    const foreground = computedStyle.getPropertyValue('--foreground').trim()
    return {
      primary: primary ? `hsl(${primary})` : isDark ? 'hsl(217, 91%, 60%)' : 'hsl(221, 83%, 53%)',
      foreground: foreground ? `hsl(${foreground})` : isDark ? 'hsl(0, 0%, 98%)' : 'hsl(240, 10%, 4%)',
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    let GLOBE_RADIUS = 0
    let GLOBE_CENTER_Z = 0
    let PROJECTION_CENTER_X = 0
    let PROJECTION_CENTER_Y = 0
    let FIELD_OF_VIEW = 0

    const dots: Dot[] = []

    class Dot {
      x: number
      y: number
      z: number
      xProject = 0
      yProject = 0
      sizeProjection = 1
      depthZ = 0

      constructor(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      }

      project(sin: number, cos: number) {
        const rotX = cos * this.x + sin * (this.z - GLOBE_CENTER_Z)
        const rotZ = -sin * this.x + cos * (this.z - GLOBE_CENTER_Z) + GLOBE_CENTER_Z
        this.depthZ = rotZ
        this.sizeProjection = FIELD_OF_VIEW / (FIELD_OF_VIEW - rotZ)
        this.xProject = rotX * this.sizeProjection + PROJECTION_CENTER_X
        this.yProject = this.y * this.sizeProjection + PROJECTION_CENTER_Y
      }

      draw(ctx2: CanvasRenderingContext2D, fgRgba: string, primaryRgba: string) {
        const depthAlpha = Math.min(0.95, Math.max(0.16, 0.28 + (this.sizeProjection - 1) * 0.32))
        ctx2.fillStyle = mixRgba(fgRgba, primaryRgba, 0.4, depthAlpha)
        ctx2.beginPath()
        ctx2.arc(
          this.xProject,
          this.yProject,
          dotRadius * this.sizeProjection,
          0,
          Math.PI * 2
        )
        ctx2.closePath()
        ctx2.fill()
      }
    }

    function createDots() {
      dots.length = 0
      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * 2 * Math.PI
        const phi = Math.acos(Math.random() * 2 - 1)
        const x = GLOBE_RADIUS * Math.sin(phi) * Math.cos(theta)
        const y = GLOBE_RADIUS * Math.sin(phi) * Math.sin(theta)
        const z = GLOBE_RADIUS * Math.cos(phi) + GLOBE_CENTER_Z
        dots.push(new Dot(x, y, z))
      }
    }

    function layoutMetrics() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      if (width < 1 || height < 1) return

      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      GLOBE_RADIUS = width * radiusFactor
      GLOBE_CENTER_Z = -GLOBE_RADIUS
      PROJECTION_CENTER_X = width / 2
      PROJECTION_CENTER_Y = height / 2
      FIELD_OF_VIEW = width * fieldOfViewFactor

      createDots()
    }

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(layoutMetrics, 150)
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (!interactive) return
      isDraggingRef.current = true
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!interactive || !isDraggingRef.current) return
      const dx = e.clientX - lastPointerRef.current.x
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      dragRotationRef.current += dx * 0.004
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (!interactive) return
      isDraggingRef.current = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      canvas.style.cursor = 'grab'
    }

    const render = (time: number) => {
      const colors = getThemeColors()
      const fgBase = hslStringToRgba(colors.foreground, 1)
      const prBase = hslStringToRgba(colors.primary, 1)

      ctx.clearRect(0, 0, width, height)

      const auto = time * rotationSpeed
      const rotation = auto + dragRotationRef.current
      const sineRotation = Math.sin(rotation)
      const cosineRotation = Math.cos(rotation)

      for (let i = 0; i < dots.length; i++) {
        dots[i].project(sineRotation, cosineRotation)
      }

      dots.sort((a, b) => b.depthZ - a.depthZ)

      for (let i = 0; i < dots.length; i++) {
        dots[i].draw(ctx, fgBase, prBase)
      }

      animationRef.current = requestAnimationFrame(render)
    }

    layoutMetrics()
    window.addEventListener('resize', onResize)

    if (interactive) {
      canvas.style.cursor = 'grab'
      canvas.addEventListener('pointerdown', handlePointerDown)
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerup', handlePointerUp)
      canvas.addEventListener('pointercancel', handlePointerUp)
    }

    const observer = new MutationObserver(() => {
      /* next frame picks up new CSS vars */
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    animationRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(resizeTimer)
      observer.disconnect()
      if (interactive) {
        canvas.removeEventListener('pointerdown', handlePointerDown)
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerup', handlePointerUp)
        canvas.removeEventListener('pointercancel', handlePointerUp)
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [
    particleCount,
    dotRadius,
    rotationSpeed,
    radiusFactor,
    fieldOfViewFactor,
    interactive,
    getThemeColors,
  ])

  const sizeClass = fillContainer
    ? 'w-full h-full'
    : 'w-full h-full max-h-[min(98vmin,560px)] aspect-square'

  return (
    <canvas
      ref={canvasRef}
      className={`${sizeClass} ${className}`.trim()}
      style={{
        display: 'block',
        touchAction: interactive ? 'none' : 'auto',
        ...(fillContainer
          ? {}
          : { maxWidth: 'min(98vmin, 560px)', margin: '0 auto' }),
      }}
    />
  )
}

export default Globe3D
