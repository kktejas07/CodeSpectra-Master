'use client'

/**
 * Wraps purchase buttons / checkout. In a browser (or an app build with
 * in-app purchase turned on) it renders its children. In the Android / iOS
 * app without IAP it renders a plain note instead — no button, no link, no
 * price call-to-action (Apple 3.1.1 / Play payments policy; see
 * mobile/capacitor/docs/IN_APP_PURCHASES.md).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '@/lib/i18n/client'

export function NativePurchaseGate({ children, compact = false, fallback }: { children: ReactNode; compact?: boolean; /** shown instead of the note when purchases are hidden (null = nothing) */ fallback?: ReactNode }) {
  const { t } = useT()
  const [allowed, setAllowed] = useState(true)
  useEffect(() => {
    let live = true
    void import('@/lib/native-bridge').then(({ nativePurchasesAllowed }) => { if (live) setAllowed(nativePurchasesAllowed()) }).catch(() => {})
    return () => { live = false }
  }, [])
  if (allowed) return <>{children}</>
  if (fallback !== undefined) return <>{fallback}</>
  if (compact) return <p className="text-sm text-muted-foreground">{t('common.manageOnWeb')}</p>
  return (
    <div role="note" className="rounded-2xl border border-border bg-card p-6 text-card-foreground">
      <p className="font-medium text-foreground">{t('common.manageOnWeb')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('common.manageOnWebBody')}</p>
    </div>
  )
}
