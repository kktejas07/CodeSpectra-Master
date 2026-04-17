'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { UserRole, UserWithPermissions } from './rbac'

/**
 * Get current user with role from Supabase (SERVER ONLY)
 */
export async function getCurrentUser(): Promise<UserWithPermissions | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      console.log('[v0] Profile fetch error:', error.message)
      return null
    }

    const role = (profile?.role || 'user') as UserRole

    return {
      id: user.id,
      email: user.email || '',
      full_name: profile?.full_name,
      role,
      is_active: profile?.is_active !== false,
      tenant_id: profile?.tenant_id,
    }
  } catch (error) {
    console.error('[v0] Error fetching current user:', error)
    return null
  }
}
