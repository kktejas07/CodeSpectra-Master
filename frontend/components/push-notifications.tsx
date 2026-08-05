'use client'

/**
 * Bootstraps FCM push for a signed-in user and turns foreground push
 * messages into in-app toasts (XP popups, announcements, results…).
 * Mount once in the dashboard layout. Renders nothing.
 */
import { useEffect, useRef } from 'react'
import { useToast } from '@/lib/toast-context'
import { registerPushToken, onPushMessage } from '@/lib/firebase-messaging'

export function PushNotifications({ userId }: { userId?: string }) {
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
            title: `Congratulations — you reached Level ${newLevel}! 🎉`,
            message: xp ? `You earned +${xp} XP. A level-up certificate is on its way.` : 'A level-up certificate is on its way.',
            duration: 7000,
          })
        } else if (type === 'xp.awarded') {
          addToast({
            type: 'success',
            title: xp ? `You gained ${xp} XP!` : 'You gained XP!',
            message: 'Keep it up — you are doing great!',
            duration: 4500,
          })
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
