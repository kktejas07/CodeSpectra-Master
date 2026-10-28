// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { stripUnsupportedTourAria } from '@/lib/tour-driver'

describe('tour highlight ARIA', () => {
  it('removes popup attributes from plain containers', () => {
    const div = document.createElement('div')
    div.setAttribute('aria-haspopup', 'dialog'); div.setAttribute('aria-expanded', 'true'); div.setAttribute('aria-controls', 'x')
    stripUnsupportedTourAria(div)
    expect(div.hasAttribute('aria-haspopup')).toBe(false)
    expect(div.hasAttribute('aria-expanded')).toBe(false)
    expect(div.getAttribute('aria-controls')).toBe('x')
  })
  it('keeps them on buttons', () => {
    const b = document.createElement('button')
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'true')
    stripUnsupportedTourAria(b)
    expect(b.getAttribute('aria-haspopup')).toBe('dialog')
  })
})

describe('tour highlight ARIA during the stage animation', () => {
  it('is stripped right after driver.js sets it, before onHighlighted fires', async () => {
    const { driver } = await import('driver.js')
    const div = document.createElement('div'); div.id = 'tour-target'; document.body.appendChild(div)
    let highlighted = false
    const d = driver({
      animate: true,
      onHighlightStarted: (el) => { if (el) queueMicrotask(() => stripUnsupportedTourAria(el)) },
      onHighlighted: () => { highlighted = true },
      steps: [{ element: '#tour-target', popover: { title: 't', description: 'd' } }],
    })
    d.drive()
    await Promise.resolve()
    expect(highlighted).toBe(false)
    expect(div.classList.contains('driver-active-element')).toBe(true)
    expect(div.hasAttribute('aria-haspopup')).toBe(false)
    expect(div.hasAttribute('aria-expanded')).toBe(false)
    d.destroy()
  })
})
