'use client'

import { useEffect, useRef } from 'react'

interface AnimatedIllustrationProps {
  type: 'ai-bot' | 'developer' | 'security' | 'performance' | 'code'
  className?: string
}

export function AnimatedIllustration({ type, className = '' }: AnimatedIllustrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.01
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      switch (type) {
        case 'ai-bot':
          drawAIBot(ctx, time, canvas.width, canvas.height)
          break
        case 'developer':
          drawDeveloper(ctx, time, canvas.width, canvas.height)
          break
        case 'security':
          drawSecurity(ctx, time, canvas.width, canvas.height)
          break
        case 'performance':
          drawPerformance(ctx, time, canvas.width, canvas.height)
          break
        case 'code':
          drawCode(ctx, time, canvas.width, canvas.height)
          break
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [type])

  return <canvas ref={canvasRef} width={400} height={300} className={`w-full ${className}`} />
}

function drawAIBot(ctx: CanvasRenderingContext2D, time: number, w: number, h: number) {
  const centerX = w / 2
  const centerY = h / 2

  // Animated background glow
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150)
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)')
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  // Head
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.arc(centerX, centerY - 40, 35, 0, Math.PI * 2)
  ctx.fill()

  // Eyes with animation
  const eyeOffset = Math.sin(time * 3) * 5
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(centerX - 15 + eyeOffset, centerY - 45, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(centerX + 15 + eyeOffset, centerY - 45, 8, 0, Math.PI * 2)
  ctx.fill()

  // Pupils
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.arc(centerX - 15 + eyeOffset, centerY - 45, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(centerX + 15 + eyeOffset, centerY - 45, 4, 0, Math.PI * 2)
  ctx.fill()

  // Smile
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(centerX, centerY - 35, 12, 0, Math.PI)
  ctx.stroke()

  // Body
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(centerX - 25, centerY - 5, 50, 50)

  // Rotating rings
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'
  ctx.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.translate(centerX, centerY + 25)
    ctx.rotate(time * 2 + (i * Math.PI) / 1.5)
    ctx.strokeRect(-30, -30, 60, 60)
    ctx.restore()
  }
}

function drawDeveloper(ctx: CanvasRenderingContext2D, time: number, w: number, h: number) {
  const centerX = w / 2
  const centerY = h / 2

  // Desk
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(centerX - 80, centerY + 40, 160, 30)

  // Monitor
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 3
  ctx.strokeRect(centerX - 50, centerY - 30, 100, 70)

  // Screen glow
  const screenGlow = Math.sin(time * 2) * 0.3 + 0.7
  ctx.fillStyle = `rgba(59, 130, 246, ${screenGlow * 0.2})`
  ctx.fillRect(centerX - 46, centerY - 26, 92, 62)

  // Code lines animation
  ctx.strokeStyle = '#10b981'
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const offset = (time * 20 + i * 15) % 60
    ctx.beginPath()
    ctx.moveTo(centerX - 40, centerY - 20 + i * 12 - offset)
    ctx.lineTo(centerX + 30, centerY - 20 + i * 12 - offset)
    ctx.stroke()
  }

  // Chair
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.arc(centerX + 70, centerY + 20, 15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(centerX + 65, centerY + 35, 10, 30)

  // Floating code symbols
  ctx.fillStyle = '#10b981'
  ctx.font = 'bold 24px monospace'
  const symbols = ['<', '>', '{', '}']
  symbols.forEach((sym, i) => {
    const x = centerX - 60 + i * 40
    const y = centerY - 50 + Math.sin(time * 2 + i) * 10
    ctx.fillText(sym, x, y)
  })
}

function drawSecurity(ctx: CanvasRenderingContext2D, time: number, w: number, h: number) {
  const centerX = w / 2
  const centerY = h / 2

  // Shield
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.moveTo(centerX, centerY - 60)
  ctx.lineTo(centerX + 40, centerY - 30)
  ctx.lineTo(centerX + 40, centerY + 30)
  ctx.quadraticCurveTo(centerX, centerY + 70, centerX - 40, centerY + 30)
  ctx.lineTo(centerX - 40, centerY - 30)
  ctx.closePath()
  ctx.fill()

  // Lock
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(centerX, centerY + 10, 12, 0, Math.PI, true)
  ctx.fill()
  ctx.fillRect(centerX - 15, centerY + 10, 30, 25)

  // Lock knob
  const knotOffset = Math.sin(time * 3) * 5
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.arc(centerX + knotOffset, centerY + 22, 4, 0, Math.PI * 2)
  ctx.fill()

  // Rotating energy rings
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)'
  ctx.lineWidth = 2
  for (let i = 0; i < 2; i++) {
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(time * (2 - i * 0.5))
    ctx.beginPath()
    ctx.arc(0, 0, 70 - i * 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawPerformance(ctx: CanvasRenderingContext2D, time: number, w: number, h: number) {
  const centerX = w / 2
  const centerY = h / 2

  // Bars animation
  const bars = 5
  const barWidth = 12
  const maxHeight = 50

  for (let i = 0; i < bars; i++) {
    const height = (Math.sin(time * 3 + i * 0.5) + 1) * (maxHeight / 2)
    const x = centerX - (bars * barWidth) / 2 + i * barWidth
    const hue = (i / bars) * 360

    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`
    ctx.fillRect(x, centerY + maxHeight - height, barWidth - 2, height)

    // Bar outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, centerY - 10, barWidth - 2, maxHeight + 10)
  }

  // Metrics text
  ctx.fillStyle = '#10b981'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('94%', centerX - 40, centerY - 60)
  ctx.fillStyle = '#f59e0b'
  ctx.fillText('88%', centerX + 15, centerY - 60)
}
