'use client'

import { useEffect, useRef } from 'react'

type RevealOptions = {
  threshold?: number
  rootMargin?: string
  staggerDelay?: number
}

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: RevealOptions = {}
) {
  const ref = useRef<T>(null)
  const { threshold = 0.1, rootMargin = '0px 0px -40px 0px', staggerDelay = 0 } = options

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const children = el.querySelectorAll<HTMLElement>('[data-reveal]')

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (children.length > 0) {
            children.forEach((child, i) => {
              child.style.setProperty('--reveal-delay', `${i * staggerDelay}ms`)
              child.dataset.revealed = 'true'
            })
          }
          el.dataset.revealed = 'true'
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, staggerDelay])

  return ref
}
