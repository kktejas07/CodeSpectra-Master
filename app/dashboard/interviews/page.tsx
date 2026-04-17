'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Code, Users, Brain, MessageSquare, Lock, Briefcase, Clock } from 'lucide-react'
import Link from 'next/link'

export default function InterviewPage() {
  const interviews = [
    {
      id: 'coding',
      title: 'Coding Interview',
      description: 'Strengthen problem-solving speed, coding accuracy, and confidence by solving real-world problems.',
      icon: <Code className="w-6 h-6" />,
      duration: '60 mins',
      difficulty: 'Medium',
      available: true,
      roles: ['Software Engineer', 'Frontend Developer', 'Backend Developer'],
    },
    {
      id: 'system-design',
      title: 'System Design',
      description: 'Improve your ability to design scalable systems and clearly justify architectural decisions.',
      icon: <Briefcase className="w-6 h-6" />,
      duration: '90 mins',
      difficulty: 'Hard',
      available: false,
      roles: ['Senior Engineer', 'Architect'],
    },
    {
      id: 'behavioral',
      title: 'Behavioral Interview',
      description: 'Practice behavioral questions in a mock setting. Refine your storytelling and STAR method.',
      icon: <MessageSquare className="w-6 h-6" />,
      duration: '45 mins',
      difficulty: 'Easy',
      available: true,
      roles: ['All Roles'],
    },
    {
      id: 'ai-fluency',
      title: 'AI Fluency Assessment',
      description: 'Demonstrate your ability to build with AI and use AI tools to solve problems and improve your workflow.',
      icon: <Brain className="w-6 h-6" />,
      duration: '30 mins',
      difficulty: 'Medium',
      available: true,
      roles: ['All Roles'],
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">AI-Powered Mock Interviews</h1>
        </div>
        <p className="text-foreground/60">
          Ace your next job interview by practicing with AI-powered mock interviews. Choose your role and get started.
        </p>
      </div>

      {/* CTA Banner */}
      <Card className="p-8 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Ready for Your Next Interview?</h3>
            <p className="text-foreground/60">
              Start a mock interview session with AI feedback. Upload your resume and configure your devices.
            </p>
          </div>
          <Button asChild size="lg" className="gap-2 whitespace-nowrap">
            <Link href="/dashboard/interviews/setup">
              Start Interview
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </Card>

      {/* Interview Types Grid */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Interview Types</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {interviews.map((interview) => (
            <Card
              key={interview.id}
              className={`p-6 transition-all ${
                interview.available
                  ? 'hover:shadow-lg hover:border-primary/50 cursor-pointer'
                  : 'opacity-60'
              }`}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-3 rounded-lg ${
                      interview.available
                        ? 'bg-primary/10'
                        : 'bg-muted'
                    }`}>
                      {interview.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-foreground">
                        {interview.title}
                      </h3>
                    </div>
                  </div>
                  {!interview.available && (
                    <Lock className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>

                {/* Description */}
                <p className="text-sm text-foreground/60 leading-relaxed">
                  {interview.description}
                </p>

                {/* Details Grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-foreground/60 font-medium">Duration</p>
                    <p className="text-foreground font-semibold">{interview.duration}</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-foreground/60 font-medium">Difficulty</p>
                    <p className="text-foreground font-semibold">{interview.difficulty}</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-foreground/60 font-medium">Roles</p>
                    <p className="text-foreground font-semibold">{interview.roles.length}</p>
                  </div>
                </div>

                {/* Roles */}
                <div className="flex flex-wrap gap-1">
                  {interview.roles.map((role) => (
                    <Badge key={role} variant="outline" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>

                {/* CTA */}
                {interview.available ? (
                  <Button asChild className="w-full gap-2">
                    <Link href="/dashboard/interviews/setup">
                      Try for Free
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button disabled className="w-full gap-2">
                    <Lock className="w-4 h-4" />
                    Coming Soon
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
