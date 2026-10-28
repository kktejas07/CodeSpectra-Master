'use client'

import { useEffect } from 'react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { ModelSelector } from '@/components/ai/model-selector'
import { Sparkles, Bot, FileText, GraduationCap, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useT } from '@/lib/i18n/client'

export default function AISettingsPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const aiSettingsTour: TourStep[] = [
        {
          target: '[data-tour="ai-settings-header"]',
          title: t('account.chooseAiModelsHere'),
          description: t('account.thisPageLetsEveryUserAssign4de'),
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-chat"]',
          title: t('account.setChatModelFirst'),
          description: t('account.selectTheModelPoweringChatCodebase247'),
          position: 'bottom',
        },
        {
          target: '[data-tour="ai-settings-models"]',
          title: t('account.tipKeepFlashDefault'),
          description: t('account.tipChangesApplyInstantlyKeepFreec91'),
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
          title={t('account.aiModelPreferences')}
          description={t('account.chooseWhichAiModelThePlatform193')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2" data-tour="ai-settings-models">
        <Panel className="p-5 space-y-3" data-tour="ai-settings-chat">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.aiChatAndAgent')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedByTheChatAssistantCodebasea7f')}</p>
            </div>
          </div>
          <ModelSelector feature="chat_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.codeReviewAndAnalysis')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedByAutomatedCodeReviewsStaticc1d')}</p>
            </div>
          </div>
          <ModelSelector feature="review_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.hintsAndTutoring')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedBySmartHintsProblemGenerationc59')}</p>
            </div>
          </div>
          <ModelSelector feature="hints_model" />
        </Panel>

        <Panel className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-medium text-foreground">{t('account.autoGrading')}</p>
              <p className="text-xs text-muted-foreground">{t('account.usedBySubmissionGradingAndAssessment666')}</p>
            </div>
          </div>
          <ModelSelector feature="grade_model" />
        </Panel>
      </div>
    </div>
  )
}
