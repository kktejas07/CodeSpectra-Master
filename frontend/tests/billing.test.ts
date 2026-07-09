import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock external dependencies
vi.mock('@/lib/mongodb', () => ({
  getMongoDb: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      findOne: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }), toArray: vi.fn().mockResolvedValue([]) }),
    }),
  }),
}))

vi.mock('@/lib/razorpay-server', () => ({
  isRazorpayConfigured: vi.fn().mockResolvedValue(true),
  getRazorpay: vi.fn().mockResolvedValue({
    orders: { create: vi.fn().mockResolvedValue({ id: 'order_abc123', amount: 49900, currency: 'INR', receipt: 'test', status: 'created' }) },
  }),
}))

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  })

  it('detects Razorpay as default provider when configured', async () => {
    const { PaymentService } = await import('@/lib/payment-service')
    const ps = new PaymentService()
    const result = await ps.createCheckout('user1', 'test@test.com', 'pro_monthly')
    expect(result.provider).toBe('razorpay')
    expect(result.gateway_id).toBe('order_abc123')
    expect(result.amount_paise).toBe(49900)
  })

  it('throws for unknown plans', async () => {
    const { PaymentService } = await import('@/lib/payment-service')
    const ps = new PaymentService()
    await expect(ps.createCheckout('user1', 'test@test.com', 'nonexistent_plan'))
      .rejects.toThrow('Unknown plan')
  })

  it('selects Razorpay for India', async () => {
    const { PaymentService } = await import('@/lib/payment-service')
    const ps = new PaymentService()
    const adapter = await ps.getAdapterForCountry('IN')
    expect(adapter.name).toBe('razorpay')
  })
})

describe('Billing Plans Catalog', () => {
  it('has all required plans', async () => {
    const { BILLING_PLANS } = await import('@/lib/db/billing')
    expect(BILLING_PLANS.pro_monthly).toBeDefined()
    expect(BILLING_PLANS.pro_yearly).toBeDefined()
    expect(BILLING_PLANS.pro_monthly.amount_paise).toBeGreaterThan(0)
    expect(BILLING_PLANS.pro_yearly.kind).toBe('subscription')
  })

  it('has correct pricing', async () => {
    const { BILLING_PLANS } = await import('@/lib/db/billing')
    const monthly = BILLING_PLANS.pro_monthly.amount_paise
    const yearly = BILLING_PLANS.pro_yearly.amount_paise
    expect(yearly).toBeLessThan(monthly * 12) // Yearly should have discount
    expect(BILLING_PLANS.pro_monthly.currency).toBe('INR')
  })
})

describe('Stripe Webhook Sync', () => {
  it('exports all sync functions', async () => {
    const mod = await import('@/lib/stripe-webhook-sync')
    expect(typeof mod.syncCheckoutSessionCompleted).toBe('function')
    expect(typeof mod.syncSubscriptionFromStripe).toBe('function')
    expect(typeof mod.syncInvoiceFromStripe).toBe('function')
  })

  it('handles empty session gracefully', async () => {
    const { syncCheckoutSessionCompleted } = await import('@/lib/stripe-webhook-sync')
    // Should not throw for missing metadata
    await expect(syncCheckoutSessionCompleted({} as any)).resolves.not.toThrow()
  })
})
