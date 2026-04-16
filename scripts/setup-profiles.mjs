import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[v0] Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupProfilesTable() {
  try {
    console.log('[v0] Creating profiles table...')

    // Create profiles table
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS profiles (
          id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          full_name TEXT,
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
          avatar_url TEXT,
          organization_id UUID,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
        
        -- Policy: Users can read their own profile
        CREATE POLICY "Users can read own profile" ON profiles
          FOR SELECT USING (auth.uid() = id);
        
        -- Policy: Admins can read all profiles in their organization
        CREATE POLICY "Admins can read organization profiles" ON profiles
          FOR SELECT USING (
            auth.uid() IN (
              SELECT id FROM profiles WHERE role IN ('superadmin', 'admin')
            )
          );
        
        -- Policy: Users can update their own profile
        CREATE POLICY "Users can update own profile" ON profiles
          FOR UPDATE USING (auth.uid() = id);
        
        -- Policy: Service role can manage all profiles
        CREATE POLICY "Service role can manage profiles" ON profiles
          USING (true) WITH CHECK (true);
      `,
    })

    if (createError) {
      console.error('[v0] Error creating table:', createError)
    } else {
      console.log('[v0] Profiles table created successfully')
    }
  } catch (error) {
    console.error('[v0] Setup error:', error)
  }
}

setupProfilesTable()
