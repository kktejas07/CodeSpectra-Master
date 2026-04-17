'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ResumeUpload } from '@/components/interviews/resume-upload'
import { AudioCameraSettings } from '@/components/interviews/audio-camera-settings'
import { InterviewRoleSelector } from '@/components/interviews/interview-role-selector'

type InterviewStage = 'role-selection' | 'resume' | 'settings' | 'dynamic' | 'feedback'

interface InterviewConfig {
  role: string
  interviewType: 'technical' | 'behavioral' | 'system-design'
  resumeInfo?: string
}

export default function InterviewSetupPage() {
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

  return (
    <div className="min-h-screen bg-background">
      {stage === 'role-selection' && (
        <div className="container max-w-7xl mx-auto py-12 px-4">
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
            onBack={handleBackToRole}
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
