'use client'

import { useState } from 'react'
import { ResumeUpload } from '@/components/interviews/resume-upload'
import { AudioCameraSettings } from '@/components/interviews/audio-camera-settings'
import { InterviewRoleSelector } from '@/components/interviews/interview-role-selector'
import { LiveInterview } from '@/components/interviews/live-interview'

type InterviewStage = 'role-selection' | 'resume' | 'settings' | 'live' | 'feedback'

export default function InterviewSetupPage() {
  const [stage, setStage] = useState<InterviewStage>('role-selection')
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [completedRoles] = useState<string[]>([])

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId)
    setStage('resume')
  }

  const handleResumeUpload = () => {
    setStage('settings')
  }

  const handleSettingsComplete = () => {
    setStage('live')
  }

  const handleEndInterview = () => {
    setStage('feedback')
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
          <ResumeUpload onContinue={handleResumeUpload} isOptional={true} />
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

      {stage === 'live' && (
        <LiveInterview
          roleId={selectedRole}
          interviewType="technical"
          onEndInterview={handleEndInterview}
        />
      )}

      {stage === 'feedback' && (
        <div className="container max-w-4xl mx-auto py-12 px-4">
          <div className="text-center space-y-8">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">Interview Complete!</h1>
              <p className="text-muted-foreground">Your interview is being analyzed by our AI.</p>
            </div>
            <div className="bg-muted rounded-lg p-12 animate-pulse">
              <p className="text-muted-foreground">Generating your detailed feedback...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
