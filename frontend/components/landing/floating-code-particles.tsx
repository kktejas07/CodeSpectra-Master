'use client'

import { useEffect, useRef } from 'react'

const snippets = [
  'const', 'async', 'await', '=>', 'function', 'import',
  'export', 'return', 'class', 'new', 'try', 'catch',
  '[]', '{}', '//', '->', '===', '??',
  '<T>', '...', '?.', '??=', '|>', '::',
  'scan()', 'fix()', 'deploy', 'test', 'build', 'ship',
]

type Particle = {
  el: HTMLSpanElement
  x: number
  y: number
  speedX: number
  speedY: number
  opacity: number
  life: number
  maxLife: number
}

export function FloatingCodeParticles({ count = 18 }: { count?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const particles: Particle[] = []
    particlesRef.current = particles

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span')
      el.className =
        'pointer-events-none absolute select-none font-mono text-[10px] font-medium tracking-wide sm:text-xs'
      el.textContent = snippets[i % snippets.length]
      el.style.color = `hsla(var(--primary) / ${0.08 + Math.random() * 0.12})`
      if (Math.random() > 0.5) {
        el.style.color = `hsla(var(--foreground) / ${0.04 + Math.random() * 0.08})`
      }
      container.appendChild(el)

      particles.push({
        el,
        x: Math.random() * 100,
        y: 100 + Math.random() * 30,
        speedX: (Math.random() - 0.5) * 0.15,
        speedY: -(0.08 + Math.random() * 0.12),
        opacity: 0.3 + Math.random() * 0.4,
        life: 0,
        maxLife: 400 + Math.random() * 600,
      })
    }

    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      for (const p of particles) {
        p.life += dt * 60
        p.x += p.speedX * dt * 60
        p.y += p.speedY * dt * 60

        const fadeIn = Math.min(1, p.life / 80)
        const fadeOut = Math.max(0, 1 - (p.life - p.maxLife + 100) / 100)
        const alpha = p.opacity * fadeIn * fadeOut

        p.el.style.left = `${p.x}%`
        p.el.style.top = `${p.y}%`
        p.el.style.opacity = String(Math.max(0, Math.min(1, alpha)))

        if (p.life > p.maxLife || p.y < -10) {
          p.life = 0
          p.y = 100 + Math.random() * 20
          p.x = Math.random() * 100
          p.opacity = 0.3 + Math.random() * 0.4
          p.speedX = (Math.random() - 0.5) * 0.15
          p.speedY = -(0.06 + Math.random() * 0.14)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      for (const p of particles) {
        p.el.remove()
      }
    }
  }, [count])

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
}
