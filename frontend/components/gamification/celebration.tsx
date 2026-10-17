'use client'

import { useEffect } from 'react'

export function Celebration() {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const count = detail.type === 'level_up' ? 80 : 30
      createConfetti(count)
    }
    window.addEventListener('codespectra:celebrate', handler)
    return () => window.removeEventListener('codespectra:celebrate', handler)
  }, [])

  return null
}

function createConfetti(count: number) {
  // Respect reduced-motion: skip the falling confetti entirely.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  const colors = ['#2f5be7', '#7f9bf3', '#38bdf8', '#f59e0b', '#22c55e', '#ec4899', '#17224d']
  
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const size = Math.random() * 8 + 4
    el.style.cssText = `
      position:absolute;
      width:${size}px;
      height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      left:${Math.random() * 100}%;
      top:-10px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      animation:confetti-fall ${Math.random() * 2 + 1.5}s ease-in forwards;
      animation-delay:${Math.random() * 0.5}s;
      transform:rotate(${Math.random() * 360}deg);
    `
    container.appendChild(el)
  }

  if (!document.getElementById('confetti-keyframes')) {
    const style = document.createElement('style')
    style.id = 'confetti-keyframes'
    style.textContent = `
      @keyframes confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }

  setTimeout(() => container.remove(), 4000)
}
