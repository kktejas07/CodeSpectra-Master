'use client'

/**
 * Client cart state shared by the drawer, the cart page, checkout and add-to-cart buttons.
 * The server is the source of truth: every action returns the re-validated cart, which is
 * broadcast with a `mkt:cart` window event so every mounted widget stays in sync.
 */
import { useCallback, useEffect, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useConfirm } from '@/lib/confirm-context'
import { useToast } from '@/lib/toast-context'
import type { CartView } from '@/lib/marketplace/cart'

const EVENT = 'mkt:cart'

export type CartActionBody = Record<string, unknown> & { action: string }

export function useCart() {
  const [cart, setCart] = useState<CartView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const addToast = useToast()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace/cart', { cache: 'no-store', credentials: 'include' })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.cart) {
        setCart(j.cart)
        window.dispatchEvent(new CustomEvent(EVENT, { detail: j.cart }))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const on = (e: Event) => setCart((e as CustomEvent<CartView>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [refresh])

  /** Run a cart action; asks before switching the cart's currency. Returns true on success. */
  const act = useCallback(async (body: CartActionBody): Promise<boolean> => {
    setBusy(true)
    try {
      const send = (b: CartActionBody) => csrfFetch('/api/marketplace/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), credentials: 'include' })
      let res = await send(body)
      let j = await res.json().catch(() => null)
      if (res.status === 409 && j?.code === 'currency_switch_required') {
        const ok = await confirm({ title: 'Switch cart currency?', description: j.error, confirmText: 'Switch currency', cancelText: 'Keep my cart' })
        if (!ok) return false
        res = await send({ ...body, switch_currency: true })
        j = await res.json().catch(() => null)
      }
      if (!res.ok) {
        addToast({ type: 'error', title: j?.error || 'Could not update your cart.' })
        return false
      }
      setCart(j.cart)
      window.dispatchEvent(new CustomEvent(EVENT, { detail: j.cart }))
      return true
    } catch {
      addToast({ type: 'error', title: 'Network error — please try again.' })
      return false
    } finally {
      setBusy(false)
    }
  }, [confirm, addToast])

  return { cart, loading, busy, refresh, act }
}

export function openCartDrawer() {
  window.dispatchEvent(new CustomEvent('mkt:open-cart'))
}
