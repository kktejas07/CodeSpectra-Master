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

    // Create or update demo user
    const demoEmail = 'demo@codespectra.com'
    const demoPassword = 'DemoPass123!'

    console.log('[v0] Starting demo user setup...')

    // First, check if user already exists
    let userExists = false
    let existingUserId = null

    try {
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      console.log('[v0] Listing users...')
      if (existingUsers?.users) {
        const found = existingUsers.users.find((u) => u.email === demoEmail)
        if (found) {
          userExists = true
          existingUserId = found.id
          console.log('[v0] Demo user already exists:', existingUserId)
        }
      }
    } catch (listError) {
      console.log('[v0] Could not list users, will try to create new:', listError)
    }

    let userId = existingUserId

    if (!userExists) {
      // Create the demo user
      console.log('[v0] Creating demo user...')
      const { data, error } = await supabase.auth.admin.createUser({
        email: demoEmail,
        password: demoPassword,
        email_confirm: true,
        user_metadata: {
          full_name: 'Demo User',
        },
      })

      if (error) {
        console.error('[v0] User creation error:', error)
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create user: ${error.message}`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      if (!data.user) {
        console.error('[v0] No user returned from creation')
        return new Response(
          JSON.stringify({
            success: false,
            error: 'User creation returned no data',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      userId = data.user.id
      console.log('[v0] Demo user created successfully:', userId)

      // Create profile in profiles table
      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        full_name: 'Demo User',
        email: demoEmail,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (profileError) {
        console.error('[v0] Profile creation error:', profileError)
        // Don't fail if profile creation fails - user can still log in
      } else {
        console.log('[v0] Profile created successfully')
      }
    } else {
      console.log('[v0] Using existing demo user')
      // Optionally update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
      
      if (profileError) {
        console.log('[v0] Profile update not critical, continuing...')
      }
    }

    console.log('[v0] Setup complete for user:', userId)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Demo user is ready. You can now log in!',
        email: demoEmail,
        password: demoPassword,
        userId: userId,
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
