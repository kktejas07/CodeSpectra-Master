'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * @deprecated This page is deprecated. Use /dashboard/events/[id] instead.
 * Judge flow is now integrated into the event detail page.
 */
export default function JudgeSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    // Redirect to event detail page with judge tab
    router.replace(`/dashboard/events/${id}?tab=judge`)
  }, [id, router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Redirecting to event…
    </div>
  )
}
