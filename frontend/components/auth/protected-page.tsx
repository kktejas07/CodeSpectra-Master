'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  getDefaultDashboard,
  normalizeUserRole,
  UserRole,
} from '@/lib/rbac'

interface ProtectedPageProps {
  children: React.ReactNode
  requiredRoles?: UserRole[]
}

export function ProtectedPage({
  children,
  requiredRoles,
}: ProtectedPageProps) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/auth/login')
      return
    }
    if (requiredRoles && requiredRoles.length > 0) {
      setIsAuthorized(false)
      return
    }
    setIsAuthorized(true)
  }, [router, requiredRoles, loading, user])

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
