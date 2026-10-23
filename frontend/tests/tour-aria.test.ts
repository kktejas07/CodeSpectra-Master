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
