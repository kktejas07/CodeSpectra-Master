import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase-env'

const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey())

// Demo accounts to be created
const DEMO_ACCOUNTS = [
  {
    email: 'demo.superadmin@codespectra.com',
    password: 'DemoPass123!',
    role: 'superadmin',
    fullName: 'Demo Superadmin',
  },
  {
    email: 'demo.admin@codespectra.com',
    password: 'DemoPass123!',
    role: 'tenant_admin',
    fullName: 'Demo Admin',
  },
  {
    email: 'demo.user@codespectra.com',
    password: 'DemoPass123!',
    role: 'user',
    fullName: 'Demo User',
  },
]

export async function POST(req: NextRequest) {
  try {
    const results = []

    for (const account of DEMO_ACCOUNTS) {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', account.email)
        .single()

      if (!existingUser) {
        // Create auth user
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
        })

        if (authError) {
          results.push({
            email: account.email,
            status: 'error',
            message: authError.message,
          })
          continue
        }

        // Create profile
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authUser.user.id,
          email: account.email,
          full_name: account.fullName,
          role: account.role,
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${account.fullName}`,
        })

        if (profileError) {
          results.push({
            email: account.email,
            status: 'error',
            message: profileError.message,
          })
          continue
        }

        // Create user level entry
        await supabase.from('user_levels').insert({
          user_id: authUser.user.id,
          level: account.role === 'superadmin' ? 99 : account.role === 'tenant_admin' ? 50 : 1,
          total_xp: account.role === 'superadmin' ? 500000 : 0,
        })

        results.push({
          email: account.email,
          status: 'created',
          userId: authUser.user.id,
        })
      } else {
        results.push({
          email: account.email,
          status: 'exists',
          message: 'User already exists',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Demo accounts setup complete',
      results,
    })
  } catch (error) {
    console.error('Demo account setup error:', error)
    return NextResponse.json(
      { error: 'Failed to setup demo accounts' },
      { status: 500 }
    )
  }
}
