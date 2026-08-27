'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SpeedInsightsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/admin/system')
  }, [router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      Redirecting to System page...
    </div>
  )
}
