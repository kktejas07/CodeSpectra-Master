import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import Stripe from 'stripe'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Load `.env.local` when `node` is run without `--env-file` (older Node). */
function loadEnvLocal() {
  const envPath = resolve(__dirname, '..', '.env.local')
  if (!existsSync(envPath)) return
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnvLocal()

/**
 * Idempotent Stripe setup for CodeSpectra billing:
 * - Ensures Products + Prices exist (lookup_key: codespectra_{plan}_{interval}).
 * - Optionally creates a webhook endpoint (HTTPS only) and prints STRIPE_WEBHOOK_SECRET once.
 *
 * Usage:
 *   node --env-file=.env.local scripts/stripe-billing-bootstrap.mjs
 *   STRIPE_WEBHOOK_URL=https://yourdomain.com/api/webhooks/stripe node --env-file=.env.local scripts/stripe-billing-bootstrap.mjs
 *
 * Local webhooks: use Stripe CLI instead (signing secret is not available via API for CLI):
 *   npm run stripe:listen
 */

const LOOKUP = {
  pro_month: { plan: 'pro', interval: 'month', env: 'STRIPE_PRICE_PRO_MONTHLY', monthlyUsd: 29 },
  pro_year: { plan: 'pro', interval: 'year', env: 'STRIPE_PRICE_PRO_YEARLY', yearlyUsd: Math.round(29 * 12 * 0.85) },
  ent_month: {
    plan: 'enterprise',
    interval: 'month',
    env: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    monthlyUsd: 99,
  },
  ent_year: {
    plan: 'enterprise',
    interval: 'year',
    env: 'STRIPE_PRICE_ENTERPRISE_YEARLY',
    yearlyUsd: Math.round(99 * 12 * 0.85),
  },
}

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_succeeded',
]

async function ensureProduct(stripe, plan) {
  const name = plan === 'pro' ? 'CodeSpectra Pro' : 'CodeSpectra Enterprise'
  let startingAfter
  for (;;) {
    const list = await stripe.products.list({ limit: 100, active: true, starting_after: startingAfter })
    const hit = list.data.find((p) => p.metadata?.codespectra_plan === plan)
    if (hit) return hit
    if (!list.has_more) break
    startingAfter = list.data[list.data.length - 1].id
  }
  return stripe.products.create({
    name,
    metadata: { codespectra_plan: plan },
  })
}

async function ensurePrice(stripe, key) {
  const spec = LOOKUP[key]
  const lookupKey = `codespectra_${spec.plan}_${spec.interval}`
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, active: true })
  if (found.data[0]) {
    return { env: spec.env, id: found.data[0].id, created: false }
  }

  const product = await ensureProduct(stripe, spec.plan)
  const isYear = spec.interval === 'year'
  const unitAmount = isYear ? Math.round(spec.yearlyUsd * 100) : Math.round(spec.monthlyUsd * 100)

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: unitAmount,
    recurring: { interval: isYear ? 'year' : 'month' },
    lookup_key: lookupKey,
    metadata: {
      codespectra_plan: spec.plan,
      codespectra_interval: spec.interval,
    },
  })
  return { env: spec.env, id: price.id, created: true }
}

async function maybeCreateWebhook(stripe) {
  const url = process.env.STRIPE_WEBHOOK_URL?.trim()
  if (!url) {
    console.log('\n# STRIPE_WEBHOOK_SECRET: skip (set STRIPE_WEBHOOK_URL=https://... to auto-create endpoint)')
    console.log('# Local dev: run `npm run stripe:listen` and paste the whsec_ value into .env.local\n')
    return null
  }
  if (!url.startsWith('https://')) {
    console.warn('STRIPE_WEBHOOK_URL must be https:// for API-created webhooks. Use Stripe CLI for localhost.')
    return null
  }

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const existing = endpoints.data.find((e) => e.url === url)
  if (existing) {
    console.log(
      `\n# Webhook already exists for this URL (secret only shown at creation). Manage in Stripe Dashboard or delete endpoint ${existing.id} and re-run.\n`
    )
    return null
  }

  const ep = await stripe.webhookEndpoints.create({
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: 'CodeSpectra billing',
  })
  return ep.secret ?? null
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    console.error('Missing STRIPE_SECRET_KEY (e.g. in .env.local).')
    process.exit(1)
  }

  const stripe = new Stripe(key, { typescript: true })
  const lines = []

  for (const k of Object.keys(LOOKUP)) {
    const { env, id, created } = await ensurePrice(stripe, k)
    lines.push(`${env}=${id}`)
    console.log(`${created ? 'Created' : 'Found'} price ${id} → ${env}`)
  }

  const whSecret = await maybeCreateWebhook(stripe)
  if (whSecret) {
    lines.push(`STRIPE_WEBHOOK_SECRET=${whSecret}`)
    console.log('\nCreated webhook endpoint; signing secret added to output below.\n')
  }

  console.log('\n--- Add or merge these into .env.local ---\n')
  console.log(lines.join('\n'))
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
