'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import {
  getDefaultDashboard,
  normalizeUserRole,
  UserRole,
} from '@/lib/rbac'

interface ProtectedPageProps {
  children: React.ReactNode
  requiredRoles?: UserRole[]
  requiredPermission?: string
}

export function ProtectedPage({
  children,
  requiredRoles,
}: ProtectedPageProps) {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      router.push('/auth/login')
      return
    }
    const userRole = normalizeUserRole(
      (session.user as { role?: string }).role,
    )
    if (requiredRoles && !requiredRoles.includes(userRole)) {
      router.push(getDefaultDashboard(userRole))
      return
    }
    setIsAuthorized(true)
  }, [router, requiredRoles, isPending, session?.user?.id])

  if (isPending) {
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
