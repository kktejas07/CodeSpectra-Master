-- Stripe linkage for dashboard (user-scoped) billing

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_stripe_invoice_id_key
  ON public.user_invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
