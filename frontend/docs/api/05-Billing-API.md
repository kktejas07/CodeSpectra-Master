> **Auto-Generated Documentation**
> **Last Updated**: 2026-07-08
> **Source**: CodeSpectra Codebase Audit
> **Auto-Update Rule**: This document must be regenerated when API endpoints or database schemas change.

# Billing API

## Implementation Status

The billing system is in **transitional state**:
- **Working**: Razorpay order creation + payment verification + webhook handling
- **503 Placeholders**: Subscription management, invoices, payment methods, cancel
- **Dead stubs**: `lib/billing-server.ts` — all functions throw errors (legacy Stripe/Supabase code removed)
- **Live plans**: Defined in `lib/db/billing.ts` — `pro_monthly` (₹499), `pro_yearly` (₹4990), `problem_pack_50` (₹199)

---

## POST /api/billing/create-order

Create a Razorpay order for a plan.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "plan_id": "pro_monthly"
}
```

**Response (200):**
```json
{
  "order_id": "order_...",
  "internal_id": "uuid",
  "amount_paise": 49900,
  "currency": "INR",
  "plan": { "id": "pro_monthly", "name": "CodeSpectra Pro · Monthly", "perks": ["..."] },
  "key_id": "rzp_live_...",
  "prefill": { "name": "user@example.com", "email": "user@example.com" }
}
```

**Error Responses:**
- `401` — Unauthorized
- `503` — Razorpay not configured (`razorpay_not_configured`)
- `400` — Unknown `plan_id`
- `502` — Razorpay API error

Creates a `billing_orders` document with `status: 'created'`.

## POST /api/billing/verify

Verify Razorpay payment signature and finalize order.

**Auth**: `getAPIUser()`

**Request Body:**
```json
{
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "signature_..."
}
```

**Response (200):**
```json
{
  "ok": true,
  "order_id": "uuid",
  "payment_id": "uuid",
  "plan_id": "pro_monthly",
  "subscription": {
    "id": "uuid",
    "ends_at": "2026-08-07T00:00:00Z"
  }
}
```
- Marks order as `paid`
- Inserts `billing_payments` document
- If `subscription` plan: creates/extends `billing_subscriptions` document

**Error Responses:**
- `401` — Unauthorized
- `400` — Missing fields, signature mismatch, invalid JSON
- `404` — Order not found

## POST /api/billing/webhook

Razorpay webhook receiver (no auth — signature verified).

**Supported Events:**
| Event | Action |
|-------|--------|
| `payment.captured` | Mark order paid, insert payment, issue subscription |
| `payment.failed` | Mark order failed, insert failed payment |
| `refund.created` | Mark payment as refunded |
| `subscription.cancelled` | Cancel active subscriptions for the plan |

**Verification**: HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET` environment variable.

**Response (200):** `{ "ok": true }`

**Error Responses:**
- `400` — Invalid signature (`invalid_signature`)
- `500` — Processing error

## GET /api/billing/me

Get user's billing status.

**Auth**: `getAPIUser()`

**Response (200):**
```json
{
  "razorpay_configured": true,
  "subscription": {
    "id": "uuid",
    "plan_id": "pro_monthly",
    "ends_at": "2026-08-07T00:00:00Z",
    "status": "active"
  },
  "plans": [
    {
      "id": "pro_monthly",
      "name": "CodeSpectra Pro · Monthly",
      "amount_paise": 49900,
      "amount_inr": 499,
      "currency": "INR",
      "kind": "subscription",
      "perks": ["Unlimited AI code reviews", "..."],
      "duration_days": 30
    }
  ]
}
```

## GET /api/billing/plans

List merged billing plans (from `pricing_tiers` + `Billing_PLANS` constant).

**Auth**: `requireAuth()`

## 503 Placeholder Endpoints (not yet implemented)

The following endpoints all return `503` with message `"Billing is not configured. Please configure a payment provider."`:

| Endpoint | Methods | Expected Intent |
|----------|---------|-----------------|
| `/api/billing/checkout` | GET, POST | Complete checkout flow |
| `/api/billing/subscription` | GET, PUT | View/update subscription |
| `/api/billing/cancel` | POST | Cancel subscription |
| `/api/billing/invoices` | GET | List invoices |
| `/api/billing/invoices/[id]` | GET | Get invoice |
| `/api/billing/invoices/[id]/download` | GET | Download invoice PDF |
| `/api/billing/payment-methods` | GET, POST | Manage payment methods |
| `/api/billing/payment-methods/[id]` | GET, DELETE | Payment method details |

## Billing Data Flow

```
Client                        Next.js API                Razorpay                MongoDB
  │                              │                         │                       │
  ├─ POST /create-order ────────▶│                         │                       │
  │                              ├─── rzp.orders.create ──▶│                       │
  │                              │◀────── order_id ────────┤                       │
  │                              ├─── insert billing_orders ─────────────────────▶│
  │◀────────── order data ───────┤                         │                       │
  │                              │                         │                       │
  │ (Razorpay Checkout opens)    │                         │                       │
  │                              │                         │                       │
  ├─ POST /verify ──────────────▶│                         │                       │
  │                              ├─── verify signature ───▶│ (HMAC check)          │
  │                              ├─── update order paid ─────────────────────────▶│
  │                              ├─── insert billing_payment ────────────────────▶│
  │                              ├─── upsert billing_subscription ───────────────▶│
  │◀────────── confirmation ─────┤                         │                       │
  │                              │                         │                       │
  │                        (or via webhook)                │                       │
  │                              │                         │                       │
  │           POST /webhook ◀────┼─────────────────────────┤                       │
  │                              ├─── sync order/payment ────────────────────────▶│
```

## Billing Plans (Hardcoded)

| Plan ID | Name | Price | Kind |
|---------|------|-------|------|
| `pro_monthly` | CodeSpectra Pro · Monthly | ₹499/mo | Subscription (30 days) |
| `pro_yearly` | CodeSpectra Pro · Yearly | ₹4,990/yr | Subscription (365 days) |
| `problem_pack_50` | 50 Premium Problem Pack | ₹199 | One-time |
