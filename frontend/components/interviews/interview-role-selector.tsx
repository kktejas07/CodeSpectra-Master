'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Laptop, Palette, Cog, Bot, Rocket, Pencil, Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
    title: 'Software Engineer',
    description: 'DSA, system design, coding patterns, and problem-solving',
    skills: ['Algorithms', 'Data Structures', 'System Design'],
    icon: Laptop,
    locked: false,
  },
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    description: 'React, Angular, Vue, and problem-solving',
    skills: ['React', 'CSS', 'JavaScript'],
    icon: Palette,
    locked: false,
  },
  {
    id: 'backend-developer',
    title: 'Backend Developer',
    description: 'Node, Python, Java, and problem-solving',
    skills: ['Node.js', 'Python', 'Java'],
    icon: Cog,
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'ai-engineer',
    title: 'AI Engineer',
    description: 'Machine Learning, Deep Learning, Generative AI, LLMs, and problem-solving',
    skills: ['ML', 'Deep Learning', 'GenAI'],
    icon: Bot,
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'forward-deployed',
    title: 'Forward Deployed Engineer',
    description: 'AWS, Azure, and problem-solving',
    skills: ['AWS', 'Azure', 'DevOps'],
    icon: Rocket,
    locked: true,
    prerequisite: 'backend-developer',
  },
  {
    id: 'custom-role',
    title: '+ Custom Role',
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-balance text-foreground sm:text-[1.75rem]">Choose your mock interview</h2>
        <p className="mt-1 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
          Start with popular ready-made roles or build your own based on a specific job description.
        </p>
      </div>

      <div className="cs-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {INTERVIEW_ROLES.map((role) => {
          const isLocked = role.locked && !completedRoles.includes(role.prerequisite || '')
          const isCompleted = completedRoles.includes(role.id)
          const RoleIcon = role.icon

          return (
            <Card
              key={role.id}
              className={`rounded-3xl border-border/70 p-6 cursor-pointer transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 ${
                selectedRole === role.id ? 'ring-2 ring-primary' : ''
              } ${
                isLocked ? 'opacity-60 pointer-events-none' : ''
              } ${
                isCompleted ? 'ring-2 ring-green-500/60 bg-green-500/5' : ''
              }`}
              onClick={() => handleSelectRole(role.id, Boolean(isLocked))}
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
                  <h3 className="font-bold text-lg text-foreground">{role.title}</h3>
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
                >
                  {isLocked ? 'Locked' : isCompleted ? 'Retake' : 'Select'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button className="flex-1" disabled={!selectedRole}>
          Continue
        </Button>
      </div>
    </div>
  )
}
