'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { useCart } from './use-cart'
import { CartLines, SavedLines, Totals } from './cart-lines'
import { useT } from '@/lib/i18n/client'

/** Cart button with item count; opens a side drawer. Listens for `mkt:open-cart`. */
export function CartDrawerButton({ className }: { className?: string }) {
  const { cart, busy, act } = useCart()
  const { t } = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('mkt:open-cart', on)
    return () => window.removeEventListener('mkt:open-cart', on)
  }, [])
  const count = cart?.count ?? 0
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('public.cartOpen', { count })}
        className={`relative inline-flex h-11 items-center gap-2 rounded-full border border-cs-grid bg-cs-sheet px-4 text-sm font-semibold text-cs-ink transition-colors hover:border-cs-accent ${className ?? ''}`}
      >
        <ShoppingCart className="h-4 w-4" aria-hidden />
        {t('public.cart')}
        {count > 0 && <span className="rounded-full bg-cs-accent px-2 py-0.5 text-xs tabular-nums text-cs-accent-ink">{count}</span>}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 bg-cs-sheet p-0 sm:max-w-md">
          <SheetHeader className="border-b border-cs-grid p-5">
            <SheetTitle className="text-cs-ink">{t('public.cartTitle')}</SheetTitle>
            <SheetDescription className="text-cs-ink-soft">{cart?.lines.length ? t('public.cartPricesIn', { currency: cart.currency }) : t('public.cartHint')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5">
            {!cart || (!cart.lines.length && !cart.saved.length) ? (
              <EmptyState compact illustration="search" title={t('public.cartEmpty')} description={t('public.cartEmptyBody')} actionLabel={t('public.cartBrowse')} actionHref="/marketplace" />
            ) : (
              <>
                <CartLines cart={cart} act={act} busy={busy} />
                <SavedLines cart={cart} act={act} busy={busy} />
              </>
            )}
          </div>
          {cart && cart.lines.length > 0 && (
            <div className="space-y-3 border-t border-cs-grid p-5">
              <Totals cart={cart} note={t('public.cartNote')} />
              <div className="flex gap-2">
                <Link href="/marketplace/cart" onClick={() => setOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-cs-ink/20 text-sm font-semibold text-cs-ink hover:border-cs-accent">{t('public.cartView')}</Link>
                {cart.ok ? (
                  <Link href="/marketplace/checkout" onClick={() => setOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-cs-accent text-sm font-semibold text-cs-accent-ink hover:brightness-110">{t('public.cartCheckout')}</Link>
                ) : (
                  <span className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-cs-paper text-sm font-semibold text-cs-ink-soft" aria-disabled>{t('public.cartFix')}</span>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
