'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock } from 'lucide-react'

interface InterviewRole {
  id: string
  title: string
  description: string
  skills: string[]
  icon: string
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
    icon: '💻',
    locked: false,
  },
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    description: 'React, Angular, Vue, and problem-solving',
    skills: ['React', 'CSS', 'JavaScript'],
    icon: '🎨',
    locked: false,
  },
  {
    id: 'backend-developer',
    title: 'Backend Developer',
    description: 'Node, Python, Java, and problem-solving',
    skills: ['Node.js', 'Python', 'Java'],
    icon: '⚙️',
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'ai-engineer',
    title: 'AI Engineer',
    description: 'Machine Learning, Deep Learning, Generative AI, LLMs, and problem-solving',
    skills: ['ML', 'Deep Learning', 'GenAI'],
    icon: '🤖',
    locked: true,
    prerequisite: 'software-engineer',
  },
  {
    id: 'forward-deployed',
    title: 'Forward Deployed Engineer',
    description: 'AWS, Azure, and problem-solving',
    skills: ['AWS', 'Azure', 'DevOps'],
    icon: '🚀',
    locked: true,
    prerequisite: 'backend-developer',
  },
  {
    id: 'custom-role',
    title: '+ Custom Role',
    description: 'Paste a job description for a tailored interview',
    skills: ['Custom', 'Tailored'],
    icon: '✏️',
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
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Choose Your Mock Interview Experience</h2>
        <p className="text-muted-foreground mt-2">
          Start with popular ready-made roles or build your own based on a specific job description.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {INTERVIEW_ROLES.map((role) => {
          const isLocked = role.locked && !completedRoles.includes(role.prerequisite || '')
          const isCompleted = completedRoles.includes(role.id)

          return (
            <Card
              key={role.id}
              className={`p-6 cursor-pointer transition-all hover:shadow-lg ${
                selectedRole === role.id ? 'ring-2 ring-primary' : ''
              } ${
                isLocked ? 'opacity-60 pointer-events-none' : ''
              } ${
                isCompleted ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950/20' : ''
              }`}
              onClick={() => handleSelectRole(role.id, isLocked)}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="text-4xl">{role.icon}</div>
                  {isLocked && (
                    <div className="p-2 bg-red-100 dark:bg-red-950/30 rounded-lg">
                      <Lock className="w-4 h-4 text-red-600" />
                    </div>
                  )}
                  {isCompleted && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
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
                  <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded">
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
