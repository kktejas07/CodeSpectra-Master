'use client'

/**
 * Bootstraps FCM push for a signed-in user and turns foreground push
 * messages into in-app toasts (XP popups, announcements, results…).
 * Mount once in the dashboard layout. Renders nothing.
 */
import { useEffect, useRef } from 'react'
import { useToast } from '@/lib/toast-context'
import { registerPushToken, onPushMessage } from '@/lib/firebase-messaging'
import { useT } from '@/lib/i18n/client'

export function PushNotifications({ userId }: { userId?: string }) {
  const { t } = useT()
  const addToast = useToast()
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    let active = true
    let unsubscribe: (() => void) | null = null

    void registerPushToken(userId).then(() => {
      if (!active) return
      unsubscribe = onPushMessage((msg) => {
        if (!active) return
        // De-dupe: the same message may also arrive via polling refetch.
        const key = msg.messageId || msg.data?.id || `${msg.title}|${msg.body}`
        if (seen.current.has(key)) return
        seen.current.add(key)

        // Let the layout refresh the bell unread badge instantly.
        window.dispatchEvent(new CustomEvent('codespectra:notification'))

        const type = msg.data?.type || ''
        const xp = msg.data?.xp
        const newLevel = msg.data?.newLevel

        if (type === 'xp.level_up' && newLevel) {
          addToast({
            type: 'success',
            title: t('dash.congratulationsYouReachedLevelNewlevel', { newLevel }),
            message: xp ? t('dash.youEarnedXpXpALevelad3', { xp }) : t('dash.aLevelUpCertificateIsOne21'),
            duration: 7000,
          })
          window.dispatchEvent(new CustomEvent('codespectra:celebrate', { detail: { type: 'level_up' } }))
        } else if (type === 'xp.awarded') {
          addToast({
            type: 'success',
            title: xp ? t('dash.youGainedXpXp', { xp }) : t('dash.youGainedXp'),
            message: t('dash.keepItUpYouAreDoingfea'),
            duration: 4500,
          })
          window.dispatchEvent(new CustomEvent('codespectra:celebrate', { detail: { type: 'xp.awarded' } }))
        } else if (msg.title) {
          addToast({ type: 'info', title: msg.title, message: msg.body, duration: 5000 })
        }
      })
    })

    return () => {
      active = false
      if (unsubscribe) unsubscribe()
    }
  }, [userId, addToast])

  return null
}
