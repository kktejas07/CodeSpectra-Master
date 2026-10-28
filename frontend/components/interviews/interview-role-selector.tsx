'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Laptop, Palette, Cog, Bot, Rocket, Pencil, Lock } from 'lucide-react'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface InterviewRole {
  id: string
  title: string
  description: string
  skills: string[]
  icon: LucideIcon
  locked?: boolean
  prerequisite?: string
}

interface InterviewRoleSelectorProps {
  onSelectRole: (roleId: string) => void
  completedRoles?: string[]
}

const INTERVIEW_ROLES: InterviewRole[] = [
  {
    id: 'software-engineer',
    title: 'Software engineer',
    description: 'DSA, system design, coding patterns, and problem-solving',
    skills: ['Algorithms', 'Data structures', 'System design'],
    icon: Laptop,
    locked: false,
  },
  {
    id: 'frontend-developer',
    title: 'Frontend developer',
    description: 'React, Angular, Vue, and problem-solving',
    skills: ['React', 'CSS', 'JavaScript'],
    icon: Palette,
    locked: false,
  },
  {
    id: 'backend-developer',
    title: 'Backend developer',
    description: 'Node, Python, Java, and problem-solving',
    skills: ['Node.js', 'Python', 'Java'],
    icon: Cog,
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'ai-engineer',
    title: 'AI engineer',
    description: 'Machine learning, deep learning, generative AI, LLMs, and problem-solving',
    skills: ['ML', 'Deep learning', 'GenAI'],
    icon: Bot,
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'forward-deployed',
    title: 'Forward deployed engineer',
    description: 'AWS, Azure, and problem-solving',
    skills: ['AWS', 'Azure', 'DevOps'],
    icon: Rocket,
    locked: true,
    prerequisite: 'backend-developer',
  },
  {
    id: 'custom-role',
    title: 'Custom role',
    description: 'Paste a job description for a tailored interview',
    skills: ['Custom', 'Tailored'],
    icon: Pencil,
    locked: false,
  },
]

export function InterviewRoleSelector({ onSelectRole, completedRoles = [] }: InterviewRoleSelectorProps) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null)

  const handleSelectRole = (roleId: string, isLocked: boolean) => {
    if (!isLocked) {
      setSelectedRole(roleId)
      onSelectRole(roleId)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="interview"
        title="Choose your mock interview"
        description="Start with a ready-made role, or build your own from a specific job description."
        className="mb-0"
      />

      <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {INTERVIEW_ROLES.map((role) => {
          const isLocked = role.locked && !completedRoles.includes(role.prerequisite || '')
          const isCompleted = completedRoles.includes(role.id)
          const RoleIcon = role.icon

          return (
            <Panel
              key={role.id}
              interactive={!isLocked}
              className={`${
                selectedRole === role.id ? 'ring-2 ring-primary' : ''
              } ${
                isLocked ? 'opacity-60' : ''
              } ${
                isCompleted ? 'ring-2 ring-green-500/60 bg-green-50 dark:bg-green-950/40' : ''
              }`}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <RoleIcon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                  </div>
                  {isLocked && (
                    <div className="p-2 bg-muted rounded-lg">
                      <Lock className="w-4 h-4 text-muted-foreground" aria-label="Locked" />
                    </div>
                  )}
                  {isCompleted && (
                    <Badge variant="success">
                      Completed
                    </Badge>
                  )}
                </div>

                {/* Title and Description */}
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{role.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                </div>

                {/* Skills */}
                <div className="flex flex-wrap gap-2">
                  {role.skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>

                {/* Lock Info */}
                {isLocked && role.prerequisite && (
                  <div className="text-xs text-muted-foreground bg-muted p-2 rounded-lg">
                    Complete {INTERVIEW_ROLES.find((r) => r.id === role.prerequisite)?.title} to unlock
                  </div>
                )}

                {/* Action Button */}
                <Button
                  className="w-full mt-2"
                  variant={selectedRole === role.id ? 'default' : 'outline'}
                  disabled={isLocked}
                  onClick={() => handleSelectRole(role.id, Boolean(isLocked))}
                  aria-label={isLocked ? `${role.title} (locked)` : `${isCompleted ? 'Retake' : 'Select'} ${role.title}`}
                >
                  {isLocked ? 'Locked' : isCompleted ? 'Retake' : 'Select'}
                </Button>
              </div>
            </Panel>
          )
        })}
      </div>

    </div>
  )
}
