import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('features')
      .select('*');

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[v0] Error fetching features:', error);
    return NextResponse.json(
      {
        data: [
          { id: '1', name: 'Unlimited Challenges', description: 'Access all challenges' },
          { id: '2', name: 'AI Code Review', description: 'Get AI-powered feedback' },
          { id: '3', name: 'Team Collaboration', description: 'Invite team members' },
          { id: '4', name: 'Advanced Analytics', description: 'Detailed progress tracking' },
          { id: '5', name: 'Code Scanner', description: 'Automated code analysis' },
          { id: '6', name: 'API Access', description: 'REST API integration' },
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
      .from('features')
      .insert([body])
      .select();

    if (error) throw error;

    return NextResponse.json({ data: data?.[0] }, { status: 201 });
  } catch (error) {
    console.error('[v0] Error creating feature:', error);
    return NextResponse.json({ error: 'Failed to create feature' }, { status: 400 });
  }
}
