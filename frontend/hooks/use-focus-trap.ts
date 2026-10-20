'use client'

/**
 * Focus handling for hand-rolled modals and drawers (the ones not built on
 * components/ui/dialog, which Radix already handles):
 * - moves focus into the panel when it opens (first focusable, or the panel),
 * - keeps Tab / Shift+Tab inside the panel,
 * - Escape calls `onClose` (pass undefined for modals that must not close),
 * - returns focus to whatever had it before the panel opened.
 *
 * Usage: `const ref = useFocusTrap<HTMLDivElement>(open, () => setOpen(false))`
 * and put `ref` + `role="dialog" aria-modal="true"` on the panel element.
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

export function useFocusTrap<T extends HTMLElement>(active: boolean, onClose?: () => void) {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) return
    const panel = ref.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    // Read ref.current on every key press: gates may swap their panel element while open.
    const items = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)

    if (!panel.contains(document.activeElement)) {
      const first = items(panel)[0]
      if (first) first.focus()
      else {
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
        panel.focus()
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const list = items(root)
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const current = document.activeElement
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
    }
  }, [active])

  return ref
}
