import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const featureName = searchParams.get('name');

    if (!featureName) {
      return NextResponse.json({ error: 'Feature name required' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ enabled: false });
    }

    // Get user's role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole) {
      return NextResponse.json({ enabled: false });
    }

    // Check role-based feature permission
    const { data: roleFeature } = await supabase
      .from('role_feature_permissions')
      .select('can_access')
      .eq('role_id', userRole.role_id)
      .eq('feature_id', featureName)
      .single();

    // Also check subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('user_id', user.id)
      .single();

    if (!subscription) {
      return NextResponse.json({ enabled: false });
    }

    // Check tier features
    const { data: tierFeature } = await supabase
      .from('tier_features')
      .select('is_enabled')
      .eq('tier_id', subscription.plan_id)
      .eq('feature_id', featureName)
      .single();

    const isEnabled = (roleFeature?.can_access ?? true) && (tierFeature?.is_enabled ?? true);

    return NextResponse.json({ enabled: isEnabled });
  } catch (error) {
    console.error('[v0] Error checking feature flag:', error);
    return NextResponse.json({ enabled: false });
  }
}
