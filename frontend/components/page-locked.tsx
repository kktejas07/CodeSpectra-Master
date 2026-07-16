'use client'

import { Lock, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function PageLocked({ routeName }: { routeName?: string }) {
  const router = useRouter()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-6">
        <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        {routeName
          ? `The ${routeName} page requires additional permissions or a plan upgrade to access.`
          : 'This page requires additional permissions or a plan upgrade to access.'}
        <br />
        Please contact your administrator to unlock this feature.
      </p>
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Go Back
      </button>
    </div>
  )
}
