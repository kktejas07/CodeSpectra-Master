'use client'

import { useEffect } from 'react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { ModelSelector } from '@/components/ai/model-selector'
import { Sparkles, Bot, FileText, GraduationCap, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'

export default function AISettingsPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const aiSettingsTour: TourStep[] = [
        {
          target: '[data-tour="ai-settings-header"]',
          title: 'Choose AI models here',
          description: 'This page lets every user assign which AI model powers each platform feature.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-chat"]',
          title: 'Set chat model first',
          description: 'Select the model powering chat, codebase chat, and the agent workspace.',
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-models"]',
          title: 'Tip: Keep Flash default',
          description: 'Tip: changes apply instantly — keep free Gemini Flash unless your admin added API keys.',
          position: 'top',
        },
      ]
      autoPlayPageTour('ai-settings', aiSettingsTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div data-tour="ai-settings-header">
        <PageHeader
          className="mb-0"
          icon={<Sparkles aria-hidden />}
          title="AI model preferences"
          description="Choose which AI model the platform uses for each feature. Changes take effect immediately. Gemini Flash is free; other models need an API key added by your admin."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2" data-tour="ai-settings-models">
        <Panel className="p-5 space-y-3" data-tour="ai-settings-chat">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">AI chat and agent</p>
              <p className="text-xs text-muted-foreground">Used by the chat assistant, codebase chat, and agent workspace</p>
            </div>
          </div>
          <ModelSelector feature="chat_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">Code review and analysis</p>
              <p className="text-xs text-muted-foreground">Used by automated code reviews, static analysis, and PR reviews</p>
            </div>
          </div>
          <ModelSelector feature="review_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">Hints and tutoring</p>
              <p className="text-xs text-muted-foreground">Used by smart hints, problem generation, and tutoring features</p>
            </div>
          </div>
          <ModelSelector feature="hints_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">Auto-grading</p>
              <p className="text-xs text-muted-foreground">Used by submission grading and assessment evaluation</p>
            </div>
          </div>
          <ModelSelector feature="grade_model" />
        </Panel>
      </div>
    </div>
  )
}
