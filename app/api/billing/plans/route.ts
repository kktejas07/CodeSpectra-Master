import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const mockPlans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      description: 'Get started with CodeSpectra',
      features: [
        'Up to 5 code scans per month',
        'Basic analysis reports',
        'Community support',
      ],
      popular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 29,
      description: 'For professional developers',
      features: [
        'Unlimited code scans',
        'Advanced analytics',
        'Integration support',
        'Email support',
      ],
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99,
      description: 'For large teams',
      features: [
        'Everything in Pro',
        'Team collaboration',
        'Dedicated support',
        'Custom integrations',
      ],
      popular: false,
    },
  ]

  return NextResponse.json(mockPlans)
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    return NextResponse.json({
      subscriptionId: String(Math.random()),
      ...data,
      status: 'active',
      startDate: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 400 })
  }
}
