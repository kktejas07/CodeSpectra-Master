'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, X, Clock } from 'lucide-react'
import { checkFaceEnrollmentReminder } from '@/lib/auth-service'
import { FaceRecognition } from '@/components/auth/face-recognition'

interface FaceEnrollmentReminderProps {
  userId: string
  onEnrollmentComplete?: () => void
}

export function FaceEnrollmentReminder({ userId, onEnrollmentComplete }: FaceEnrollmentReminderProps) {
  const [showReminder, setShowReminder] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState(7)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkReminder()
  }, [userId])

  const checkReminder = async () => {
    try {
      const result = await checkFaceEnrollmentReminder(userId)
      if (result.success && result.shouldRemind) {
        setDaysRemaining(result.daysRemaining || 0)
        setShowReminder(true)
      }
    } catch (error) {
      console.error('Error checking enrollment reminder:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEnrollmentComplete = async (faceData: { front: string; left: string; right: string }) => {
    try {
      const response = await fetch('/api/auth/face-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ faceData }),
      })

      if (response.ok) {
        setShowReminder(false)
        onEnrollmentComplete?.()
      }
    } catch (error) {
      console.error('Face enrollment error:', error)
    }
  }

  const handleDismiss = () => {
    setShowReminder(false)
    // Save dismiss preference (optional - user can still see it later)
  }

  if (loading || !showReminder) {
    return null
  }

  if (isEnrolling) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border rounded-t-lg shadow-2xl max-h-[90vh] overflow-y-auto z-50">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-foreground">Enroll Your Face</h3>
            <button
              onClick={() => setIsEnrolling(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <FaceRecognition
            onCapture={handleEnrollmentComplete}
            mode="signup"
            onSkip={() => setIsEnrolling(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50">
      <div className="bg-card border-2 border-primary/50 rounded-lg p-6 shadow-xl space-y-4 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Complete Your Security Setup</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {daysRemaining > 0
                  ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
                  : 'Expires today'}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            You skipped face enrollment during signup. Add biometric login now for:
          </p>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full" />
              Faster, passwordless login
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full" />
              Enhanced account security
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full" />
              Takes less than 1 minute
            </li>
          </ul>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Time remaining</span>
            <span>{Math.max(0, daysRemaining)} / 7 days</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-primary to-primary/50 transition-all"
              style={{ width: `${((7 - daysRemaining) / 7) * 100}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => setIsEnrolling(true)}
            className="flex-1"
            size="sm"
          >
            Enroll Now
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="flex-1"
          >
            Later
          </Button>
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center border-t border-border pt-3">
          Your face data is encrypted and only used for login authentication
        </p>
      </div>
    </div>
  )
}
