import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    // Get the admin key from environment - only works server-side
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Supabase environment variables',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Create or update demo user
    const demoEmail = 'demo@codespectra.com'
    const demoPassword = 'DemoPass123!'

    // First, try to get the user
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const userExists = existingUser?.users?.some((u) => u.email === demoEmail)

    if (!userExists) {
      // Create the demo user
      const { data, error } = await supabase.auth.admin.createUser({
        email: demoEmail,
        password: demoPassword,
        email_confirm: true,
        user_metadata: {
          full_name: 'Demo User',
        },
      })

      if (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      console.log('[v0] Demo user created:', data.user?.id)

      // Create profile in profiles table
      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: 'Demo User',
          email: demoEmail,
          avatar_url: null,
        })

        if (profileError) {
          console.error('[v0] Profile creation error:', profileError)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Demo user is ready. Email: demo@codespectra.com | Password: DemoPass123!',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[v0] Setup error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
