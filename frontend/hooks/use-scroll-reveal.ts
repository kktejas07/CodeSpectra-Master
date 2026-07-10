'use client'

import { useEffect, useRef } from 'react'

type RevealOptions = {
  threshold?: number
  rootMargin?: string
  staggerDelay?: number
}

function revealElement(el: Element, staggerDelay: number) {
  const children = el.querySelectorAll<HTMLElement>('[data-reveal]')
  children.forEach((child, i) => {
    child.style.setProperty('--reveal-delay', `${i * staggerDelay}ms`)
    child.dataset.revealed = 'true'
  })
  ;(el as HTMLElement).dataset.revealed = 'true'
}

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: RevealOptions = {}
) {
  const ref = useRef<T>(null)
  const { threshold = 0.1, rootMargin = '0px 0px -40px 0px', staggerDelay = 0 } = options

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Check initial visibility — set data-revealed on the next frame so CSS has time to paint
    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const visible = rect.top < vh + parseInt(rootMargin) && rect.bottom > 0
      if (visible) {
        revealElement(el, staggerDelay)
        return
      }

      // Not visible yet — wait for scroll
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            revealElement(el, staggerDelay)
            observer.unobserve(el)
          }
        },
        { threshold, rootMargin }
      )
      observer.observe(el)
    })

    return () => cancelAnimationFrame(raf)
  }, [threshold, rootMargin, staggerDelay])

  return ref
}
