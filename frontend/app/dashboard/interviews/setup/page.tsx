'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ResumeUpload } from '@/components/interviews/resume-upload'
import { AudioCameraSettings } from '@/components/interviews/audio-camera-settings'
import { InterviewRoleSelector } from '@/components/interviews/interview-role-selector'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Loader2 } from 'lucide-react'
import { SkeletonCard, SkeletonButton } from '@/components/ui/skeleton-boneyard'

type InterviewStage = 'role-selection' | 'resume' | 'settings' | 'dynamic' | 'feedback'

interface InterviewConfig {
  role: string
  interviewType: 'technical' | 'behavioral' | 'system-design'
  resumeInfo?: string
}

export default function InterviewSetupPage() {
  const gate = usePageGuard('user')

  const router = useRouter()
  const [stage, setStage] = useState<InterviewStage>('role-selection')
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [completedRoles] = useState<string[]>([])
  const [config, setConfig] = useState<InterviewConfig>({
    role: '',
    interviewType: 'technical',
  })

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId)
    setConfig((prev) => ({ ...prev, role: roleId }))
    setStage('resume')
  }

  const handleResumeUpload = (resumeText?: string) => {
    setConfig((prev) => ({ ...prev, resumeInfo: resumeText }))
    setStage('settings')
  }

  const handleSettingsComplete = () => {
    // Navigate to dynamic interview with config
    const params = new URLSearchParams({
      role: config.role,
      type: config.interviewType,
      ...(config.resumeInfo && { resume: config.resumeInfo }),
    })
    router.push(`/dashboard/interviews/dynamic?${params.toString()}`)
  }

  const handleBackToRole = () => {
    setStage('role-selection')
  }

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Only 2 stable first-paint landmarks: the page stages render conditionally,
  // so the tour anchors the always-rendered wrapper and the initial role step.
  const { startTour, setTourSeen } = useTour()
  useEffect(() => {
    if (gate.ready) {
      const interviewSetupTour: TourStep[] = [
        {
          target: '[data-tour="interview-setup-header"]',
          title: 'Set up interview',
          description: 'Follow these steps to configure and launch your practice interview.',
          position: 'bottom',
        },
        {
          target: '[data-tour="interview-setup-roles"]',
          title: 'Pick your role',
          description: 'Choose a role to tailor the interview questions to that position.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('interview-setup', interviewSetupTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-4xl mx-auto space-y-6 px-4">
        <SkeletonCard />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SkeletonButton />
          <SkeletonButton />
          <SkeletonButton />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background" data-tour="interview-setup-header">
      {stage === 'role-selection' && (
        <div className="py-12" data-tour="interview-setup-roles">
          <InterviewRoleSelector
            onSelectRole={handleRoleSelect}
            completedRoles={completedRoles}
          />
        </div>
      )}

      {stage === 'resume' && (
        <div className="min-h-screen flex items-center justify-center py-12 px-4">
          <ResumeUpload
            onContinue={handleResumeUpload}
            isOptional={true}
          />
        </div>
      )}

      {stage === 'settings' && (
        <div className="min-h-screen flex items-center justify-center py-12 px-4">
          <AudioCameraSettings
            onContinue={handleSettingsComplete}
            onBack={() => setStage('resume')}
          />
        </div>
      )}
    </div>
  )
}


