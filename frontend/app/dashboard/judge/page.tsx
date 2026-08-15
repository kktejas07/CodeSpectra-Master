'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * @deprecated This page is deprecated. Use /dashboard/events/[id] instead.
 * Judge flow is now integrated into the event detail page.
 */
export default function JudgeDashboardPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to events page
    router.replace('/dashboard/events')
  }, [router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Redirecting to Events…
    </div>
  )
}
