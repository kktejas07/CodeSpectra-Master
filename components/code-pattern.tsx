'use client'

import { useEffect, useRef } from 'react'

export function CodePattern() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    ctx.scale(dpr, dpr)

    // Clear canvas
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

    // Characters to draw
    const chars = ['[', ']', '{', '}', '(', ')', 'L', 'r', 'F', 'T', 'f', '|', '—', '├', '┤', '┬', '┴', '─', '•', '◆', '■', '□', '▪', '▢']

    // Draw code pattern
    const drawPattern = () => {
      ctx.fillStyle = 'rgba(200, 200, 200, 0.25)'
      ctx.font = '14px monospace'
      ctx.textBaseline = 'top'

      // Create a grid with random characters
      const spacing = 40
      const jitter = 15

      for (let y = -spacing; y < window.innerHeight + spacing; y += spacing) {
        for (let x = -spacing; x < window.innerWidth + spacing; x += spacing) {
          // Random jitter
          const jx = x + (Math.random() - 0.5) * jitter
          const jy = y + (Math.random() - 0.5) * jitter

          // Random character
          const char = chars[Math.floor(Math.random() * chars.length)]

          // Random opacity
          const opacity = 0.15 + Math.random() * 0.2
          ctx.fillStyle = `rgba(150, 150, 150, ${opacity})`

          // Random rotation for some characters
          if (Math.random() > 0.7) {
            ctx.save()
            ctx.translate(jx, jy)
            ctx.rotate((Math.random() - 0.5) * 0.3)
            ctx.fillText(char, 0, 0)
            ctx.restore()
          } else {
            ctx.fillText(char, jx, jy)
          }
        }
      }
    }

    drawPattern()

    // Handle window resize
    const handleResize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
      drawPattern()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  )
}
