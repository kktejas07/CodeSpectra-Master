import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .order('sort_order');

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[v0] Error fetching pricing tiers:', error);
    return NextResponse.json(
      {
        data: [
          { id: '1', name: 'Free', price_monthly: 0, description: 'Get started' },
          { id: '2', name: 'Pro', price_monthly: 2999, description: 'For professionals' },
          { id: '3', name: 'Enterprise', price_monthly: 9999, description: 'For teams' },
        ],
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { data, error } = await supabase
      .from('pricing_tiers')
      .insert([body])
      .select();

    if (error) throw error;

    return NextResponse.json({ data: data?.[0] }, { status: 201 });
  } catch (error) {
    console.error('[v0] Error creating pricing tier:', error);
    return NextResponse.json({ error: 'Failed to create tier' }, { status: 400 });
  }
}
