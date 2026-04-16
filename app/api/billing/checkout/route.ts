import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json()

    // Redirect to Stripe checkout
    // In production: create Stripe session and redirect to checkout
    return NextResponse.json({
      success: true,
      url: `https://checkout.stripe.com/pay/cs_test_plan_${plan}`,
    })
  } catch (error) {
    console.error('[v0] Checkout error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
