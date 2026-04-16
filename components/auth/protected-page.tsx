'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { canAccessPage, UserRole } from '@/lib/rbac'

interface ProtectedPageProps {
  children: React.ReactNode
  requiredRoles?: UserRole[]
  requiredPermission?: string
}

export function ProtectedPage({ 
  children, 
  requiredRoles,
  requiredPermission 
}: ProtectedPageProps) {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseKey) {
          router.push('/auth/login')
          return
        }

        const supabase = createClient(supabaseUrl, supabaseKey)
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/auth/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const userRole = (profile?.role || 'user') as UserRole

        // Check role-based access
        if (requiredRoles && !requiredRoles.includes(userRole)) {
          console.log('[v0] User role', userRole, 'not in required roles:', requiredRoles)
          router.push('/dashboard')
          return
        }

        setIsAuthorized(true)
      } catch (error) {
        console.error('[v0] Authorization check error:', error)
        router.push('/auth/login')
      } finally {
        setLoading(false)
      }
    }

    checkAccess()
  }, [router, requiredRoles, requiredPermission])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
