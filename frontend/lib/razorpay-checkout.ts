'use client'

import { csrfFetch } from './csrf-fetch'

/** Shape returned by POST /api/billing/checkout and /api/billing/create-order (lib/payment-service CheckoutResult). */
export interface CheckoutResponse {
  provider?: string
  gateway_id?: string
  /** Razorpay subscription checkout (INR autopay): open the modal with this instead of an order. */
  subscription_id?: string
  key_id?: string
  redirect_url?: string
  amount_paise?: number
  currency?: string
  plan?: { id?: string; name?: string }
}

export const PAYMENTS_NOT_SET_UP = "Payments aren't set up yet. Contact us to upgrade your plan."

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let scriptPromise: Promise<void> | null = null

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout needs a browser'))
  if ((window as any).Razorpay) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script')
      el.src = SCRIPT_SRC
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load the payment window. Check your connection and try again.'))
      }
      document.body.appendChild(el)
    })
  }
  return scriptPromise
}

export type CheckoutOutcome =
  | { status: 'paid'; planId?: string }
  | { status: 'redirected' }
  | { status: 'dismissed' }

/**
 * Completes a checkout response from the billing API.
 *  - redirect-based gateways (Stripe, PhonePe, 100%-off coupon): navigates away.
 *  - Razorpay: loads checkout.js, opens the modal, and resolves `paid` only after
 *    /api/billing/verify confirms the payment on the server.
 * Throws with a user-facing message on any failure.
 */
export async function completeCheckout(
  data: CheckoutResponse,
  opts: { email?: string; description?: string } = {},
): Promise<CheckoutOutcome> {
  if (data.redirect_url) {
    window.location.href = data.redirect_url
    return { status: 'redirected' }
  }
  if (data.provider !== 'razorpay' || !data.gateway_id) {
    throw new Error(PAYMENTS_NOT_SET_UP)
  }
  if (!data.key_id) throw new Error(PAYMENTS_NOT_SET_UP)

  await loadRazorpayScript()
  const Razorpay = (window as any).Razorpay
  if (!Razorpay) throw new Error('Could not load the payment window. Try again.')

  return new Promise<CheckoutOutcome>((resolve, reject) => {
    const rzp = new Razorpay({
      key: data.key_id,
      ...(data.subscription_id
        ? { subscription_id: data.subscription_id }
        : { amount: data.amount_paise, currency: data.currency || 'INR', order_id: data.gateway_id }),
      name: 'CodeSpectra',
      description: opts.description || data.plan?.name || 'CodeSpectra plan',
      prefill: opts.email ? { email: opts.email } : undefined,
      handler: async (response: {
        razorpay_order_id?: string
        razorpay_subscription_id?: string
        razorpay_payment_id: string
        razorpay_signature: string
      }) => {
        try {
          const res = await csrfFetch('/api/billing/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, plan_id: data.plan?.id }),
          })
          const j = await res.json().catch(() => ({}))
          if (!res.ok || !j.ok) {
            reject(new Error(
              'We could not confirm your payment. If you were charged, contact support with payment id '
              + response.razorpay_payment_id + '.',
            ))
            return
          }
          resolve({ status: 'paid', planId: j.plan_id })
        } catch {
          reject(new Error(
            'We could not confirm your payment. If you were charged, contact support with payment id '
            + response.razorpay_payment_id + '.',
          ))
        }
      },
      modal: { ondismiss: () => resolve({ status: 'dismissed' }) },
    })
    // A failed attempt stays inside the modal (Razorpay lets the user retry);
    // we settle on handler success or on dismiss.
    rzp.open()
  })
}
