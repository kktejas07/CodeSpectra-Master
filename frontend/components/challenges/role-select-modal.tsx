'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Lock, CheckCircle, ArrowRight } from 'lucide-react'

interface RoleSelectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (role: string) => void
  completedRoles?: string[]
}

interface Role {
  id: string
  title: string
  description: string
  topics: string[]
  locked: boolean
  completed: boolean
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
}

const ROLES: Role[] = [
  {
    id: 'software-engineer',
    title: 'Software Engineer',
    description: 'Solve algorithmic and data structure problems designed to test your problem-solving skills.',
    topics: ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Dynamic Programming', 'Sorting'],
    locked: false,
    completed: true,
    difficulty: 'Intermediate',
  },
  {
    id: 'frontend-developer',
    title: 'Front-End Developer',
    description: 'Work on challenges covering React, JavaScript, and CSS, testing your core frontend knowledge.',
    topics: ['React', 'JavaScript', 'CSS', 'HTML', 'ES6+', 'DOM'],
    locked: false,
    completed: false,
    difficulty: 'Intermediate',
  },
  {
    id: 'backend-developer',
    title: 'Back-End Developer',
    description: 'Work on challenges covering Node.js, databases, and backend expertise.',
    topics: ['Node.js', 'Databases', 'APIs', 'Authentication', 'Caching', 'Scalability'],
    locked: false,
    completed: false,
    difficulty: 'Advanced',
  },
]

export function RoleSelectModal({ open, onClose, onSelect, completedRoles = [] }: RoleSelectModalProps) {
  const [hoveredRole, setHoveredRole] = useState<string | null>(null)

  const getRoles = () =>
    ROLES.map((role) => ({
      ...role,
      completed: completedRoles.includes(role.id),
      locked: role.id !== 'software-engineer' && !completedRoles.includes('software-engineer'),
    }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Select a Role</DialogTitle>
          <DialogDescription>Choose a role to start practicing. Complete roles to unlock advanced ones.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {getRoles().map((role) => (
            <Card
              key={role.id}
              className={`relative p-6 border transition-all cursor-pointer ${
                role.locked ? 'opacity-60 border-border/40 cursor-not-allowed' : 'border-border/40 hover:border-primary/40'
              } ${hoveredRole === role.id && !role.locked ? 'ring-2 ring-primary' : ''}`}
              onMouseEnter={() => !role.locked && setHoveredRole(role.id)}
              onMouseLeave={() => setHoveredRole(null)}
            >
              {/* Lock Overlay */}
              {role.locked && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Lock className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Complete Software Engineer first</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{role.title}</h3>
                    <Badge variant="outline" className="text-xs mt-1">
                      {role.difficulty}
                    </Badge>
                  </div>
                  {role.completed && (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">{role.description}</p>

                {/* Topics */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Topics Covered</p>
                  <div className="flex flex-wrap gap-1">
                    {role.topics.map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => {
                    onSelect(role.id)
                    onClose()
                  }}
                  disabled={role.locked}
                  className="w-full mt-4 gap-2"
                  variant={role.completed ? 'outline' : 'default'}
                >
                  {role.completed ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Try Again
                    </>
                  ) : (
                    <>
                      Start Interview
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Benefits Section */}
        <div className="mt-8 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm font-medium text-foreground mb-2">Why Complete All Roles?</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Unlock specialized interview types for specific job roles</li>
            <li>Build a well-rounded skill set across frontend, backend, and full-stack</li>
            <li>Earn role-specific certifications to showcase your expertise</li>
            <li>Prepare comprehensively for your dream job interview</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
