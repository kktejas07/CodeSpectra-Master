import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    // Get the admin key from environment - only works server-side
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[v0] Missing env vars:', { supabaseUrl: !!supabaseUrl, supabaseServiceKey: !!supabaseServiceKey })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Supabase environment variables. Please check your .env configuration.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Define demo users with different roles
    const demoUsers = [
      {
        email: 'superadmin@codespectra.com',
        password: 'SuperAdmin123!',
        full_name: 'Super Admin',
        role: 'superadmin',
      },
      {
        email: 'admin@codespectra.com',
        password: 'TenantAdmin123!',
        full_name: 'Tenant Admin',
        role: 'admin',
      },
      {
        email: 'demo@codespectra.com',
        password: 'DemoPass123!',
        full_name: 'Demo User',
        role: 'user',
      },
    ]

    console.log('[v0] Starting demo users setup...')

    const createdUsers = []

    // Create each demo user
    for (const demoUser of demoUsers) {
      try {
        // Check if user already exists
        let userExists = false
        let existingUserId = null

        try {
          const { data: existingUsers } = await supabase.auth.admin.listUsers()
          if (existingUsers?.users) {
            const found = existingUsers.users.find((u) => u.email === demoUser.email)
            if (found) {
              userExists = true
              existingUserId = found.id
              console.log(`[v0] ${demoUser.role} user already exists:`, existingUserId)
            }
          }
        } catch (listError) {
          console.log(`[v0] Could not list users for ${demoUser.email}, will try to create new`)
        }

        let userId = existingUserId

        if (!userExists) {
          // Create the demo user
          console.log(`[v0] Creating ${demoUser.role} user...`)
          const { data, error } = await supabase.auth.admin.createUser({
            email: demoUser.email,
            password: demoUser.password,
            email_confirm: true,
            user_metadata: {
              full_name: demoUser.full_name,
              role: demoUser.role,
            },
          })

          if (error) {
            console.error(`[v0] ${demoUser.role} user creation error:`, error)
            continue
          }

          if (!data.user) {
            console.error(`[v0] No user returned from ${demoUser.role} creation`)
            continue
          }

          userId = data.user.id
          console.log(`[v0] ${demoUser.role} user created successfully:`, userId)
        }

        // Create or update profile in profiles table
        const existingProfile = await supabase.from('profiles').select('id').eq('id', userId).single()

        if (existingProfile.error && existingProfile.error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const { error: profileError } = await supabase.from('profiles').insert({
            id: userId,
            full_name: demoUser.full_name,
            email: demoUser.email,
            role: demoUser.role,
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

          if (profileError) {
            console.error(`[v0] ${demoUser.role} profile creation error:`, profileError)
          } else {
            console.log(`[v0] ${demoUser.role} profile created successfully`)
          }
        } else {
          // Profile exists, update it
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              role: demoUser.role,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

          if (profileError) {
            console.log(`[v0] ${demoUser.role} profile update issue:`, profileError)
          }
        }

        createdUsers.push({
          email: demoUser.email,
          password: demoUser.password,
          full_name: demoUser.full_name,
          role: demoUser.role,
          userId,
        })
      } catch (userError) {
        console.error(`[v0] Error setting up ${demoUser.role}:`, userError)
      }
    }

    console.log('[v0] Setup complete for all users')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Demo users are ready. You can now log in!',
        users: createdUsers,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[v0] Setup error:', error)
    const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({
        success: false,
        error: `Setup error: ${errorMsg}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
