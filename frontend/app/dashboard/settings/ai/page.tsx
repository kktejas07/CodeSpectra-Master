'use client'

import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { ModelSelector } from '@/components/ai/model-selector'
import { Sparkles, Bot, FileText, GraduationCap, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'

export default function AISettingsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_ai-settings_tour')) {
      const aiSettingsTour: TourStep[] = [
        {
          target: '[data-tour="ai-settings-header"]',
          title: 'Pick your models',
          description: 'Choose which AI model powers each platform feature on this page.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-chat"]',
          title: 'Chat and agent',
          description: 'This selector controls the model behind chat, codebase chat, and the agent workspace.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-models"]',
          title: 'Tune every feature',
          description: 'Set separate models for reviews, hints, and grading; changes apply immediately.',
          position: 'top',
        },
      ]
      startTour(aiSettingsTour, 'ai-settings')
      setTourSeen('ai-settings')
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold flex items-center gap-2" data-tour="ai-settings-header">
        <Sparkles className="h-7 w-7 text-primary" /> AI Model Preferences
      </h1>
      <p className="text-sm text-muted-foreground">
        Choose which AI model the platform uses for each feature. Changes take effect immediately.
        Gemini Flash is free; other models require an API key configured by your admin.
      </p>

      <div className="space-y-4" data-tour="ai-settings-models">
        <Card className="p-5 space-y-3" data-tour="ai-settings-chat">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">AI Chat & Agent</p>
              <p className="text-xs text-muted-foreground">Used by the chat assistant, codebase chat, and agent workspace</p>
            </div>
          </div>
          <ModelSelector feature="chat_model" />
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Code Review & Analysis</p>
              <p className="text-xs text-muted-foreground">Used by automated code reviews, static analysis, and PR reviews</p>
            </div>
          </div>
          <ModelSelector feature="review_model" />
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Hints & Tutoring</p>
              <p className="text-xs text-muted-foreground">Used by smart hints, problem generation, and tutoring features</p>
            </div>
          </div>
          <ModelSelector feature="hints_model" />
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Auto-Grading</p>
              <p className="text-xs text-muted-foreground">Used by submission grading and assessment evaluation</p>
            </div>
          </div>
          <ModelSelector feature="grade_model" />
        </Card>
      </div>
    </div>
  )
}
