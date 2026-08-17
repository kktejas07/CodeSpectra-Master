'use client'

import { useEffect, useRef } from 'react'

const terminalSnippets = [
  { text: '$ pnpm run dev', color: 'text-teal-400/80 border-teal-500/30 bg-teal-950/30' },
  { text: '✓ Compiled in 0.82s', color: 'text-emerald-400/80 border-emerald-500/30 bg-emerald-950/30' },
  { text: 'DATABASE_URL="prisma://postgres"', color: 'text-amber-400/80 border-amber-500/30 bg-amber-950/30' },
  { text: 'export async function agent()', color: 'text-cyan-400/80 border-cyan-500/30 bg-cyan-950/30' },
  { text: 'git commit -m "feat(ai): ship"', color: 'text-sky-400/80 border-sky-500/30 bg-sky-950/30' },
  { text: 'GET /api/ai/complete 200 OK', color: 'text-emerald-400/80 border-emerald-500/30 bg-emerald-950/30' },
  { text: '<TypeSafeSchema model="User" />', color: 'text-purple-400/80 border-purple-500/30 bg-purple-950/30' },
  { text: '⚡ Vector Embedding 1536d', color: 'text-pink-400/80 border-pink-500/30 bg-pink-950/30' },
  { text: '$ docker compose up -d', color: 'text-sky-400/80 border-sky-500/30 bg-sky-950/30' },
  { text: '✓ All 14 tests passing', color: 'text-emerald-400/80 border-emerald-500/30 bg-emerald-950/30' },
  { text: 'const client = new PrismaClient()', color: 'text-cyan-400/80 border-cyan-500/30 bg-cyan-950/30' },
  { text: 'HTTP 1.1 200 OK [4ms]', color: 'text-teal-400/80 border-teal-500/30 bg-teal-950/30' },
]

type Particle = {
  el: HTMLDivElement
  x: number
  y: number
  speedX: number
  speedY: number
  opacity: number
  life: number
  maxLife: number
}

export function FloatingCodeParticles({ count = 14 }: { count?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const particles: Particle[] = []
    particlesRef.current = particles

    for (let i = 0; i < count; i++) {
      const snippet = terminalSnippets[i % terminalSnippets.length]
      const el = document.createElement('div')
      
      // Subtle background floating pill tag — low opacity, small font so it doesn't block hero text or globe
      el.className = `pointer-events-none absolute select-none font-mono text-[10px] sm:text-xs font-medium tracking-wide px-2.5 py-1 rounded-full border backdrop-blur-xs transition-opacity duration-300 ${snippet.color}`
      el.textContent = snippet.text

      container.appendChild(el)

      particles.push({
        el,
        x: (i % 4) * 24 + Math.random() * 10,
        y: Math.random() * 85,
        speedX: (Math.random() - 0.5) * 0.08,
        speedY: -(0.04 + Math.random() * 0.06),
        opacity: 0.15 + Math.random() * 0.15, // Low ambient opacity (15% to 30%)
        life: Math.random() * 200,
        maxLife: 450 + Math.random() * 350,
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

        const fadeIn = Math.min(1, p.life / 40)
        const fadeOut = Math.max(0, 1 - (p.life - p.maxLife + 60) / 60)
        const alpha = p.opacity * fadeIn * fadeOut

        p.el.style.left = `${p.x}%`
        p.el.style.top = `${p.y}%`
        p.el.style.opacity = String(Math.max(0, Math.min(1, alpha)))

        if (p.life > p.maxLife || p.y < -10) {
          p.life = 0
          p.y = 95 + Math.random() * 15
          p.x = Math.random() * 90
          p.opacity = 0.15 + Math.random() * 0.15
          p.speedX = (Math.random() - 0.5) * 0.08
          p.speedY = -(0.04 + Math.random() * 0.06)
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

  return <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden z-0 pointer-events-none" aria-hidden />
}
