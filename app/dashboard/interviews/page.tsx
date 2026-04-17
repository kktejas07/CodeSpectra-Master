'use client'

import { useState } from 'react'
import { RoleSelectModal } from '@/components/challenges/role-select-modal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Zap, Users, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default function InterviewPage() {
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [completedRoles, setCompletedRoles] = useState<string[]>(['software-engineer'])

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role)
    // Here you would typically navigate to the interview or store the selection
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Mock Interviews</h1>
        <p className="text-muted-foreground">
          Practice with AI-powered mock interviews tailored to specific roles. Complete each role to unlock specialized interview types.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-yellow-500" />
            <div>
              <p className="text-sm text-muted-foreground">Roles Completed</p>
              <p className="text-2xl font-bold">{completedRoles.length}/3</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Interviews</p>
              <p className="text-2xl font-bold">7</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Avg. Score</p>
              <p className="text-2xl font-bold">85%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Start New Interview */}
      <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-lg mb-1">Ready for a new challenge?</h3>
            <p className="text-muted-foreground text-sm">
              Select a role and start practicing with real interview questions
            </p>
          </div>
          <Button onClick={() => setShowRoleModal(true)} className="gap-2">
            <Zap className="w-4 h-4" />
            Start Interview
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Interview Types Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Interview Types</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Technical Screen */}
          <Card className="p-6 border-border/40 hover:border-primary/40 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Badge className="mb-2">Interview Type</Badge>
                <h3 className="font-semibold text-lg">Technical Screen</h3>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Practice a recruiter screening to identify gaps in CS fundamentals, role fit, and interview readiness.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              <p>Duration: 30 minutes</p>
              <p>Questions: 15-20</p>
              <p>Focus: Fundamentals, Communication</p>
            </div>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href="/dashboard/interviews/technical-screen">
                Practice Now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>

          {/* Coding Interview */}
          <Card className="p-6 border-border/40 hover:border-primary/40 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Badge className="mb-2">Interview Type</Badge>
                <h3 className="font-semibold text-lg">Coding Interview</h3>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Strengthen problem-solving speed, coding accuracy, and confidence by solving real-world problems.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              <p>Duration: 60 minutes</p>
              <p>Questions: 2-3</p>
              <p>Focus: Algorithms, Data Structures</p>
            </div>
            <Button asChild className="w-full gap-2">
              <Link href="/dashboard/interviews/coding">
                Practice Now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>

          {/* System Design */}
          <Card className="p-6 border-border/40 opacity-60">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Badge className="mb-2">Interview Type</Badge>
                <h3 className="font-semibold text-lg">System Design</h3>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Improve your ability to design scalable systems and clearly justify architectural decisions.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              <p>Duration: 60 minutes</p>
              <p>Questions: 1-2</p>
              <p>Focus: Architecture, Scalability</p>
            </div>
            <Button disabled className="w-full gap-2">
              Unlock after Coding Interview
            </Button>
          </Card>

          {/* Behavioral Interview */}
          <Card className="p-6 border-border/40 hover:border-primary/40 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div>
                <Badge className="mb-2">Interview Type</Badge>
                <h3 className="font-semibold text-lg">Behavioral Interview</h3>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Practice behavioral questions in a mock setting. Refine your storytelling and STAR method.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              <p>Duration: 45 minutes</p>
              <p>Questions: 4-5</p>
              <p>Focus: Communication, Teamwork</p>
            </div>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href="/dashboard/interviews/behavioral">
                Practice Now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        </div>
      </div>

      {/* Role Selection Modal */}
      <RoleSelectModal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        onSelect={handleRoleSelect}
        completedRoles={completedRoles}
      />
    </div>
  )
}
