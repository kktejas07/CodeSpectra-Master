'use client'

import { useEffect, useRef } from 'react'

export function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const rotationRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Set canvas size to device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const centerX = width / 2
    const centerY = height / 2
    const globeRadius = Math.min(width, height) / 2.2

    // Continent coordinates (simplified)
    const continents = [
      // North America
      { points: [[80, 40], [90, 30], [95, 35], [85, 50], [80, 40]], rotation: 0 },
      // South America
      { points: [[85, 45], [90, 50], [92, 65], [88, 70], [85, 45]], rotation: 0 },
      // Europe
      { points: [[110, 35], [125, 30], [130, 40], [120, 50], [110, 35]], rotation: 0 },
      // Africa
      { points: [[125, 50], [135, 45], [140, 65], [130, 75], [125, 50]], rotation: 0 },
      // Asia
      { points: [[140, 20], [160, 15], [170, 40], [150, 55], [140, 20]], rotation: 0 },
      // Australia
      { points: [[165, 65], [175, 62], [178, 75], [168, 78], [165, 65]], rotation: 0 },
    ]

    const drawGlobe = () => {
      // Clear canvas with transparent background
      ctx.clearRect(0, 0, width, height)

      const rotation = rotationRef.current

      // Draw main globe sphere
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, globeRadius * 1.3)
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.08)')
      gradient.addColorStop(0.7, 'rgba(59, 130, 246, 0.02)')
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, globeRadius * 1.3, 0, Math.PI * 2)
      ctx.fill()

      // Draw globe outline
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(centerX, centerY, globeRadius, 0, Math.PI * 2)
      ctx.stroke()

      // Draw latitude lines (equator, tropics, arctic circles)
      const latitudes = [0, 23.5, -23.5, 66.5, -66.5, 90, -90]
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)'
      ctx.lineWidth = 0.8

      latitudes.forEach((lat) => {
        if (Math.abs(lat) >= 80) return // Skip poles for cleaner look

        const scale = Math.cos((lat * Math.PI) / 180)
        const y = centerY - Math.sin((lat * Math.PI) / 180) * globeRadius * 0.85

        if (lat === 0) {
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.2)' // Equator brighter
        }

        ctx.beginPath()
        ctx.ellipse(centerX, y, globeRadius * scale * 0.85, globeRadius * scale * 0.2, 0, 0, Math.PI * 2)
        ctx.stroke()
      })

      // Draw longitude lines
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.08)'
      ctx.lineWidth = 0.6

      for (let lng = -180; lng < 180; lng += 30) {
        const angle = ((lng + rotation) * Math.PI) / 180
        const adjustedAngle = angle

        // Draw semi-circle from pole to pole
        ctx.beginPath()
        for (let lat = -90; lat <= 90; lat += 5) {
          const latRad = (lat * Math.PI) / 180
          const cosLat = Math.cos(latRad)
          const sinLat = Math.sin(latRad)

          const x = centerX + Math.cos(adjustedAngle) * cosLat * globeRadius * 0.85
          const y = centerY - sinLat * globeRadius * 0.85

          if (lat === -90) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Draw continents/landmass as subtle regions
      continents.forEach((continent, idx) => {
        ctx.fillStyle = `rgba(139, 92, 246, ${0.08 + Math.sin(Date.now() / 3000 + idx) * 0.02})`
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)'
        ctx.lineWidth = 0.5

        ctx.beginPath()
        continent.points.forEach((point, i) => {
          const lat = point[0] - 90
          const lng = point[1] - 180 + rotation

          const latRad = (lat * Math.PI) / 180
          const lngRad = (lng * Math.PI) / 180

          const cosLat = Math.cos(latRad)
          const x = centerX + Math.cos(lngRad) * cosLat * globeRadius * 0.85
          const y = centerY - Math.sin(latRad) * globeRadius * 0.85

          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.fill()
        ctx.stroke()
      })

      // Draw interactive city markers
      const cities = [
        { lat: 51.5074, lng: 360 - 0.1278, name: 'London' },
        { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
        { lat: 37.7749, lng: 360 - 122.4194, name: 'SF' },
        { lat: -33.8688, lng: 151.2093, name: 'Sydney' },
        { lat: 48.8566, lng: 2.3522, name: 'Paris' },
        { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
      ]

      cities.forEach((city, i) => {
        const adjustedLng = city.lng + rotation
        const latRad = (city.lat * Math.PI) / 180
        const lngRad = (adjustedLng * Math.PI) / 180

        const cosLat = Math.cos(latRad)
        const x = centerX + Math.cos(lngRad) * cosLat * globeRadius * 0.85
        const y = centerY - Math.sin(latRad) * globeRadius * 0.85

        // Only draw if on front hemisphere
        if (cosLat > 0) {
          const time = Date.now() / 1500
          const pulse = Math.sin(time + i) * 0.4 + 0.6

          // Outer glow
          ctx.fillStyle = `rgba(139, 92, 246, ${0.2 * pulse})`
          ctx.beginPath()
          ctx.arc(x, y, 6 * pulse, 0, Math.PI * 2)
          ctx.fill()

          // Middle ring
          ctx.strokeStyle = `rgba(139, 92, 246, ${0.4 * pulse})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, y, 4 * pulse, 0, Math.PI * 2)
          ctx.stroke()

          // Core dot
          ctx.fillStyle = 'rgba(139, 92, 246, 0.95)'
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      rotationRef.current += 0.03
      animationRef.current = requestAnimationFrame(drawGlobe)
    }

    drawGlobe()

    const handleResize = () => {
      const newRect = canvas.getBoundingClientRect()
      canvas.width = newRect.width * dpr
      canvas.height = newRect.height * dpr
      ctx.scale(dpr, dpr)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{
        display: 'block',
        filter: 'drop-shadow(0 0 60px rgba(139, 92, 246, 0.1))',
      }}
    />
  )
}
