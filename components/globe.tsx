'use client'

import { useEffect, useRef } from 'react'

export function Globe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect()
    canvas.width = rect?.width || 400
    canvas.height = rect?.height || 400

    let rotation = 0

    const drawGlobe = () => {
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const radius = Math.min(canvas.width, canvas.height) / 2.5

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.02)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw gradient background
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5)
      gradient.addColorStop(0, 'rgba(217, 119, 255, 0.15)')
      gradient.addColorStop(1, 'rgba(217, 119, 255, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2)
      ctx.fill()

      // Draw globe outline
      ctx.strokeStyle = 'rgba(217, 119, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.stroke()

      // Draw latitude lines
      ctx.strokeStyle = 'rgba(217, 119, 255, 0.15)'
      ctx.lineWidth = 0.5
      for (let lat = -75; lat <= 75; lat += 15) {
        const y = centerY - (lat / 90) * (radius * 0.8)
        const scale = Math.cos((lat * Math.PI) / 180) * 0.8
        ctx.beginPath()
        ctx.ellipse(centerX, y, radius * scale, radius * scale * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Draw longitude lines
      for (let lng = 0; lng < 360; lng += 30) {
        const angle = ((lng + rotation) * Math.PI) / 180
        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(angle)
        ctx.strokeStyle = 'rgba(217, 119, 255, 0.1)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(0, -radius * 0.8)
        ctx.lineTo(0, radius * 0.8)
        ctx.stroke()
        ctx.restore()
      }

      // Draw animated dots (cities/nodes)
      const cities = [
        { lat: 51.5074, lng: -0.1278, label: 'London' },
        { lat: 35.6762, lng: 139.6503, label: 'Tokyo' },
        { lat: 37.7749, lng: -122.4194, label: 'SF' },
        { lat: -33.8688, lng: 151.2093, label: 'Sydney' },
        { lat: 48.8566, lng: 2.3522, label: 'Paris' },
        { lat: 1.3521, lng: 103.8198, label: 'Singapore' },
      ]

      cities.forEach((city, i) => {
        const lng = city.lng + rotation
        const x = centerX + Math.cos((lng * Math.PI) / 180) * radius * 0.75
        const y = centerY - Math.sin((city.lat * Math.PI) / 180) * radius * 0.75

        // Pulsing glow
        const pulse = Math.sin(Date.now() / 1000 + i) * 0.5 + 0.5
        ctx.fillStyle = `rgba(217, 119, 255, ${0.3 * pulse})`
        ctx.beginPath()
        ctx.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2)
        ctx.fill()

        // Core dot
        ctx.fillStyle = 'rgba(217, 119, 255, 0.9)'
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
      })

      rotation += 0.05
      animationRef.current = requestAnimationFrame(drawGlobe)
    }

    drawGlobe()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ filter: 'blur(0.5px)' }}
      />
    </div>
  )
}
