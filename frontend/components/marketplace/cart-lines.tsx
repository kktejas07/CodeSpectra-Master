'use client'

import Link from 'next/link'
import { Minus, Plus, Trash2, Bookmark, CalendarClock, ShoppingCart } from 'lucide-react'
import type { CartView, CartViewLine } from '@/lib/marketplace/cart'
import { formatMinor } from '@/lib/marketplace/pricing'
import type { CartActionBody } from './use-cart'
import { useT } from '@/lib/i18n/client'
import type { MessageKey } from '@/lib/i18n/catalog'

// Shared with the cart drawer on cached public pages, so these live in the bundled `public` namespace.
const ISSUE_KEY: Record<string, MessageKey> = {
  unavailable: 'public.cartIssueUnavailable',
  out_of_stock: 'public.cartIssueOutOfStock',
  qty_reduced: 'public.cartIssueQtyReduced',
  slot_unavailable: 'public.cartIssueSlotUnavailable',
  slot_missing: 'public.cartIssueSlotMissing',
  currency: 'public.cartIssueCurrency',
}

export function formatSlot(iso: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function Line({ l, act, busy, saved }: { l: CartViewLine; act: (b: CartActionBody) => Promise<boolean>; busy: boolean; saved?: boolean }) {
  const { t, locale } = useT()
  return (
    <li className="flex gap-3 py-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-cs-grid bg-cs-paper">
        {l.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.image} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cs-ink-soft"><ShoppingCart className="h-5 w-5" aria-hidden /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {l.slug ? <Link href={`/marketplace/p/${l.slug}`} className="line-clamp-2 text-sm font-semibold text-cs-ink hover:text-cs-accent-text">{l.title}</Link> : <p className="text-sm font-semibold text-cs-ink">{l.title}</p>}
            <p className="text-xs text-cs-ink-soft">{[l.variant_name, l.seller.name && t('public.byName', { name: l.seller.name })].filter(Boolean).join(' · ')}</p>
            {l.service_slot && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-cs-ink-soft"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{formatSlot(l.service_slot, locale)}</p>
            )}
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-cs-ink">{formatMinor(l.unit_price * l.qty, l.currency)}</p>
        </div>
        {l.issues.map((i) => (
          <p key={i} className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">{ISSUE_KEY[i] ? t(ISSUE_KEY[i]) : i}</p>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!saved && l.kind === 'physical' && l.max_qty > 0 && (
            <div className="inline-flex items-center rounded-full border border-cs-grid">
              <button type="button" aria-label={t('public.cartDecrease', { title: l.title })} disabled={busy || l.qty <= 1} onClick={() => act({ action: 'update', key: l.key, qty: l.qty - 1 })} className="flex h-8 w-8 items-center justify-center rounded-full text-cs-ink hover:bg-cs-paper disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{l.qty}</span>
              <button type="button" aria-label={t('public.cartIncrease', { title: l.title })} disabled={busy || l.qty >= l.max_qty} onClick={() => act({ action: 'update', key: l.key, qty: l.qty + 1 })} className="flex h-8 w-8 items-center justify-center rounded-full text-cs-ink hover:bg-cs-paper disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {saved ? (
            <>
              <button type="button" disabled={busy} onClick={() => act({ action: 'move_to_cart', key: l.key })} className="rounded-full px-2 py-1 text-xs font-semibold text-cs-accent-text hover:underline">{t('public.cartMoveToCart')}</button>
              <button type="button" disabled={busy} onClick={() => act({ action: 'remove_saved', key: l.key })} className="rounded-full px-2 py-1 text-xs font-semibold text-cs-ink-soft hover:text-cs-ink">{t('public.cartRemove')}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => act({ action: 'save_for_later', key: l.key })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-cs-ink-soft hover:text-cs-ink"><Bookmark className="h-3.5 w-3.5" aria-hidden />{t('public.cartSaveForLater')}</button>
              <button type="button" disabled={busy} onClick={() => act({ action: 'remove', key: l.key })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-cs-ink-soft hover:text-red-600"><Trash2 className="h-3.5 w-3.5" aria-hidden />{t('public.cartRemove')}</button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export function CartLines({ cart, act, busy }: { cart: CartView; act: (b: CartActionBody) => Promise<boolean>; busy: boolean }) {
  return <ul className="divide-y divide-cs-grid">{cart.lines.map((l) => <Line key={l.key} l={l} act={act} busy={busy} />)}</ul>
}

export function SavedLines({ cart, act, busy }: { cart: CartView; act: (b: CartActionBody) => Promise<boolean>; busy: boolean }) {
  const { t } = useT()
  if (!cart.saved.length) return null
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-cs-ink">{t('public.cartSavedForLater')}</h3>
      <ul className="divide-y divide-cs-grid">{cart.saved.map((l) => <Line key={l.key} l={l} act={act} busy={busy} saved />)}</ul>
    </div>
  )
}

export function Totals({ cart, quote = cart.quote, note }: { cart: CartView; quote?: CartView['quote']; note?: string }) {
  const { t } = useT()
  if (!quote) return null
  const c = quote.currency
  const taxLabel = c === 'INR' ? 'GST' : t('public.cartSalesTax')
  const rate = `${quote.tax_bps / 100}%`
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between"><dt className="text-cs-ink-soft">{t('public.cartSubtotal')}</dt><dd className="tabular-nums text-cs-ink">{formatMinor(quote.subtotal, c)}</dd></div>
      {quote.discount_total > 0 && <div className="flex justify-between"><dt className="text-cs-ink-soft">{t('public.cartDiscount')}</dt><dd className="tabular-nums text-green-700 dark:text-green-400">−{formatMinor(quote.discount_total, c)}</dd></div>}
      {cart.needs_shipping && <div className="flex justify-between"><dt className="text-cs-ink-soft">{t('public.cartShipping')}</dt><dd className="tabular-nums text-cs-ink">{quote.shipping_total ? formatMinor(quote.shipping_total, c) : t('public.cartFree')}</dd></div>}
      {quote.tax_bps > 0 && (
        <div className="flex justify-between"><dt className="text-cs-ink-soft">{quote.prices_include_tax ? t('public.cartIncludesTax', { tax: taxLabel, rate }) : `${taxLabel} (${rate})`}</dt><dd className="tabular-nums text-cs-ink">{formatMinor(quote.tax_total, c)}</dd></div>
      )}
      <div className="flex justify-between border-t border-cs-grid pt-2 text-base font-bold"><dt className="text-cs-ink">{t('public.cartTotal')}</dt><dd className="tabular-nums text-cs-ink">{formatMinor(quote.grand_total, c)}</dd></div>
      {note && <p className="pt-1 text-xs text-cs-ink-soft">{note}</p>}
    </dl>
  )
}
