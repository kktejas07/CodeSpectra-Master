'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ArrowLeft, Loader2, FileText, Sparkles } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { ROLE_OPTIONS, DIFFICULTY_LEVELS } from '@/lib/interviews/ai-mock-types'

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

const DURATION_OPTIONS = [15, 20, 30, 45]

export default function AiMockSetupPage() {
  const gate = usePageGuard('user')
  const router = useRouter()

  const [resumeText, setResumeText] = useState('')
  const [role, setRole] = useState('Software Engineer')
  const [customRole, setCustomRole] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [duration, setDuration] = useState(20)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // First-visit guided tour (same pattern as the other dashboard pages).
  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const aiMockSetupTour: TourStep[] = [
        {
          target: '[data-tour="ai-mock-setup-header"]',
          title: 'AI mock interview',
          description: 'Configure an AI-led practice session tailored to your goals.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-mock-setup-start"]',
          title: 'Start the session',
          description: 'Click here to begin your AI mock interview when ready.',
          position: 'top',
        },
        {
          target: '[data-tour="ai-mock-setup-options"]',
          title: 'Tune your practice',
          description: 'Pick a role, difficulty, duration, and optionally add your resume.',
          position: 'top',
        },
      ]
      autoPlayPageTour('ai-mock-setup', aiMockSetupTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  const effectiveRole = role === 'Custom' ? customRole.trim() : role

  const handleStart = async () => {
    if (!effectiveRole) {
      setError('Please select or enter a role.')
      return
    }
    setStarting(true)
    setError('')

    try {
      const res = await fetch('/api/interviews/ai-mock/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeText.trim() || undefined,
          role: effectiveRole,
          difficulty,
          duration,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to start interview.')
        setStarting(false)
        return
      }

      sessionStorage.setItem(`aimock_${data.sessionId}`, JSON.stringify({
        sessionId: data.sessionId,
        firstQuestion: data.firstQuestion,
        totalQuestions: data.totalQuestions,
        role: effectiveRole,
        difficulty,
        duration,
      }))

      router.push(`/dashboard/interviews/ai-mock?session=${data.sessionId}`)
    } catch {
      setError('Network error. Please try again.')
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3" data-tour="ai-mock-setup-header">
        <Link href="/dashboard/interviews" className="rounded-lg p-2 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> AI Mock Interview
        </h1>
      </div>

      <Card className="p-6 space-y-5" data-tour="ai-mock-setup-options">
        {/* Role */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Target Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {role === 'Custom' && (
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Enter your target role..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </div>

        {/* Difficulty */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Difficulty</label>
          <div className="grid grid-cols-4 gap-2">
            {DIFFICULTY_LEVELS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  difficulty === d
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Duration</label>
          <div className="flex gap-2">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  duration === d
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* Resume */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" /> Resume (optional)
          </label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume for personalized questions..."
            className="w-full h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleStart}
          disabled={starting || (role === 'Custom' && !customRole.trim())}
          className="w-full"
          size="lg"
          data-tour="ai-mock-setup-start"
        >
          {starting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing...</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Start Interview</>
          )}
        </Button>
      </Card>
    </div>
  )
}
