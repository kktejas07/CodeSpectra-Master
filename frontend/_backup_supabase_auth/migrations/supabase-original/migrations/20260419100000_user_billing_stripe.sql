-- Stripe linkage for dashboard user billing (Checkout + webhooks).
-- Kept in repo to match remote migration history; uses IF NOT EXISTS for idempotency with 20260418200000.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_stripe_subscription_id_uidx
  ON public.user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_stripe_invoice_id_uidx
  ON public.user_invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
