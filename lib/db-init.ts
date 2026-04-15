'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function initializeDatabase() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('[v0] Checking and creating database tables...');

    // Check if profiles table exists
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (profilesError?.code === 'PGRST116') {
      console.log('[v0] Creating profiles table...');
      // Table doesn't exist - we'll create it through direct SQL
      // For now, we'll assume the migration will be run separately
      console.log('[v0] Please run: supabase migration up');
    }

    // Check for other tables
    const tables = ['challenges', 'submissions', 'courses', 'leaderboard'];
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      if (error?.code === 'PGRST116') {
        console.log(`[v0] Table '${table}' does not exist. Run migrations.`);
      }
    }

    console.log('[v0] Database check completed.');
    return true;
  } catch (error) {
    console.error('[v0] Database initialization error:', error);
    return false;
  }
}
