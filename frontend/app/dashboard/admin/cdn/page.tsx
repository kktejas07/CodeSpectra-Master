'use client'

import { useRoleGate } from '@/lib/use-role-gate'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CdnAdminPage() {
  const gate = useRoleGate({ require: 'superadmin' })
  const router = useRouter()

  useEffect(() => {
    if (gate.ready) router.replace('/dashboard/admin/system')
  }, [gate.ready, router])

  return null
}


