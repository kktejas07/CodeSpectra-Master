'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Globe3DProps {
  className?: string
  particleCount?: number
  globeRadius?: number
  rotationSpeed?: number
  interactive?: boolean
}

export function Globe3D({
  className = '',
  particleCount = 1500,
  globeRadius = 200,
  rotationSpeed = 0.002,
  interactive = true,
}: Globe3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const dotsRef = useRef<Dot[]>([])
  const rotationRef = useRef({ x: 0, y: 0 })
  const targetRotationRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })

  // Get theme colors from CSS variables
  const getThemeColors = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        primary: 'hsl(217, 91%, 60%)',
        foreground: 'hsl(0, 0%, 98%)',
        background: 'hsl(240, 10%, 4%)',
        muted: 'hsl(240, 5%, 65%)',
      }
    }

    const computedStyle = getComputedStyle(document.documentElement)
    const isDark = document.documentElement.classList.contains('dark')
    
    // Parse HSL values from CSS variables
    const primary = computedStyle.getPropertyValue('--primary').trim()
    const foreground = computedStyle.getPropertyValue('--foreground').trim()
    const muted = computedStyle.getPropertyValue('--muted-foreground').trim()
    
    return {
      primary: primary ? `hsl(${primary})` : (isDark ? 'hsl(217, 91%, 60%)' : 'hsl(221, 83%, 53%)'),
      foreground: foreground ? `hsl(${foreground})` : (isDark ? 'hsl(0, 0%, 98%)' : 'hsl(240, 10%, 4%)'),
      muted: muted ? `hsl(${muted})` : (isDark ? 'hsl(240, 5%, 65%)' : 'hsl(240, 4%, 46%)'),
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High DPI setup
    const dpr = window.devicePixelRatio || 1
    let width: number
    let height: number
    let centerX: number
    let centerY: number

    const PERSPECTIVE = 800
    const GLOBE_RADIUS = globeRadius

    // Dot class for particles
    class Dot {
      theta: number
      phi: number
      x: number = 0
      y: number = 0
      z: number = 0
      xProjected: number = 0
      yProjected: number = 0
      scaleProjected: number = 0
      size: number
      opacity: number

      constructor() {
        this.theta = Math.random() * 2 * Math.PI
        this.phi = Math.acos(Math.random() * 2 - 1)
        this.size = 1 + Math.random() * 2
        this.opacity = 0.3 + Math.random() * 0.7
      }

      project(sin: { x: number; y: number }, cos: { x: number; y: number }) {
        // Convert spherical to Cartesian
        const x = GLOBE_RADIUS * Math.sin(this.phi) * Math.cos(this.theta)
        const y = GLOBE_RADIUS * Math.cos(this.phi)
        const z = GLOBE_RADIUS * Math.sin(this.phi) * Math.sin(this.theta) + GLOBE_RADIUS

        // Rotate around Y axis
        const rotatedX = cos.y * x + sin.y * (z - GLOBE_RADIUS)
        const rotatedZ = -sin.y * x + cos.y * (z - GLOBE_RADIUS) + GLOBE_RADIUS

        // Rotate around X axis
        const rotatedY = cos.x * y - sin.x * (rotatedZ - GLOBE_RADIUS)
        const finalZ = sin.x * y + cos.x * (rotatedZ - GLOBE_RADIUS) + GLOBE_RADIUS

        this.x = rotatedX
        this.y = rotatedY
        this.z = finalZ

        // Project to 2D
        this.scaleProjected = PERSPECTIVE / (PERSPECTIVE + finalZ)
        this.xProjected = rotatedX * this.scaleProjected + centerX
        this.yProjected = rotatedY * this.scaleProjected + centerY
      }

      draw(ctx: CanvasRenderingContext2D, colors: ReturnType<typeof getThemeColors>) {
        // Only draw particles on front half of globe
        if (this.z < GLOBE_RADIUS * 0.3) return

        const alpha = this.opacity * this.scaleProjected * (this.z / (GLOBE_RADIUS * 2))
        const size = this.size * this.scaleProjected

        // Gradient based on depth
        const depthRatio = this.z / (GLOBE_RADIUS * 2)
        
        ctx.beginPath()
        ctx.arc(this.xProjected, this.yProjected, size, 0, Math.PI * 2)
        ctx.fillStyle = colors.primary.replace(')', `, ${alpha * depthRatio})`)
                         .replace('hsl', 'hsla')
        ctx.fill()

        // Add glow effect for closer particles
        if (depthRatio > 0.7 && size > 1.5) {
          ctx.beginPath()
          ctx.arc(this.xProjected, this.yProjected, size * 2, 0, Math.PI * 2)
          ctx.fillStyle = colors.primary.replace(')', `, ${alpha * 0.15})`)
                           .replace('hsl', 'hsla')
          ctx.fill()
        }
      }
    }

    // Initialize dots
    const initDots = () => {
      dotsRef.current = []
      for (let i = 0; i < particleCount; i++) {
        dotsRef.current.push(new Dot())
      }
    }

    // Resize handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      centerX = width / 2
      centerY = height / 2
    }

    // Mouse/touch handlers for interaction
    const handlePointerDown = (e: PointerEvent) => {
      if (!interactive) return
      isDraggingRef.current = true
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      canvas.style.cursor = 'grabbing'
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!interactive || !isDraggingRef.current) return
      
      const deltaX = e.clientX - lastMouseRef.current.x
      const deltaY = e.clientY - lastMouseRef.current.y
      
      targetRotationRef.current.y += deltaX * 0.005
      targetRotationRef.current.x += deltaY * 0.005
      
      // Clamp X rotation
      targetRotationRef.current.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotationRef.current.x))
      
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
    }

    const handlePointerUp = () => {
      isDraggingRef.current = false
      canvas.style.cursor = interactive ? 'grab' : 'default'
    }

    // Animation loop
    const render = () => {
      const colors = getThemeColors()

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Auto-rotate when not dragging
      if (!isDraggingRef.current) {
        targetRotationRef.current.y += rotationSpeed
      }

      // Smooth interpolation
      rotationRef.current.x += (targetRotationRef.current.x - rotationRef.current.x) * 0.05
      rotationRef.current.y += (targetRotationRef.current.y - rotationRef.current.y) * 0.05

      // Pre-calculate sin/cos for rotation
      const sin = {
        x: Math.sin(rotationRef.current.x),
        y: Math.sin(rotationRef.current.y),
      }
      const cos = {
        x: Math.cos(rotationRef.current.x),
        y: Math.cos(rotationRef.current.y),
      }

      // Project all dots
      dotsRef.current.forEach(dot => dot.project(sin, cos))

      // Depth sort (furthest first)
      dotsRef.current.sort((a, b) => a.z - b.z)

      // Draw globe outline (subtle)
      ctx.beginPath()
      ctx.arc(centerX, centerY, GLOBE_RADIUS * 0.98, 0, Math.PI * 2)
      ctx.strokeStyle = colors.primary.replace(')', ', 0.1)')
                         .replace('hsl', 'hsla')
      ctx.lineWidth = 1
      ctx.stroke()

      // Draw longitude/latitude lines (very subtle)
      ctx.strokeStyle = colors.primary.replace(')', ', 0.05)')
                         .replace('hsl', 'hsla')
      ctx.lineWidth = 0.5

      // Draw equator
      ctx.beginPath()
      ctx.ellipse(centerX, centerY, GLOBE_RADIUS * 0.98, GLOBE_RADIUS * 0.2, 0, 0, Math.PI * 2)
      ctx.stroke()

      // Draw all dots
      dotsRef.current.forEach(dot => dot.draw(ctx, colors))

      // Add center glow
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, GLOBE_RADIUS * 1.2
      )
      gradient.addColorStop(0, colors.primary.replace(')', ', 0.08)')
                              .replace('hsl', 'hsla'))
      gradient.addColorStop(0.5, colors.primary.replace(')', ', 0.02)')
                               .replace('hsl', 'hsla'))
      gradient.addColorStop(1, 'transparent')
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, GLOBE_RADIUS * 1.2, 0, Math.PI * 2)
      ctx.fill()

      animationRef.current = requestAnimationFrame(render)
    }

    // Initialize
    handleResize()
    initDots()
    
    if (interactive) {
      canvas.style.cursor = 'grab'
      canvas.addEventListener('pointerdown', handlePointerDown)
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerup', handlePointerUp)
      canvas.addEventListener('pointerleave', handlePointerUp)
    }
    
    window.addEventListener('resize', handleResize)
    render()

    // Theme change observer
    const observer = new MutationObserver(() => {
      // Theme changed, colors will update on next frame
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      window.removeEventListener('resize', handleResize)
      if (interactive) {
        canvas.removeEventListener('pointerdown', handlePointerDown)
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerup', handlePointerUp)
        canvas.removeEventListener('pointerleave', handlePointerUp)
      }
      observer.disconnect()
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [particleCount, globeRadius, rotationSpeed, interactive, getThemeColors])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{
        display: 'block',
        touchAction: 'none',
      }}
    />
  )
}

export default Globe3D
