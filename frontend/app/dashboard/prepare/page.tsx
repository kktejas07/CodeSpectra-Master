'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Code,
  Database,
  Cpu,
  Brain,
  Zap,
  ArrowRight,
  Lock,
  CheckCircle,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'

interface PrepKit {
  id: string
  title: string
  description: string
  challenges: number
  mockTests: number
  mockInterviews: number
  certification: number
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  progress: number
  cta: string
}

interface SkillCategory {
  id: string
  title: string
  icon: React.ReactNode
  count: number
  difficulty: string
  popular: boolean
}

const PREP_KITS: PrepKit[] = [
  {
    id: 'software-engineer',
    title: 'Software Engineer Prep Kit',
    description: 'Complete preparation for software engineering interviews',
    challenges: 53,
    mockTests: 1,
    mockInterviews: 3,
    certification: 1,
    difficulty: 'Advanced',
    progress: 0,
    cta: 'Start Preparation',
  },
]

const PRACTICE_CATEGORIES: SkillCategory[] = [
  {
    id: 'algorithms',
    title: 'Algorithms',
    icon: <Cpu className="w-6 h-6" />,
    count: 450,
    difficulty: 'All Levels',
    popular: true,
  },
  {
    id: 'data-structures',
    title: 'Data Structures',
    icon: <Database className="w-6 h-6" />,
    count: 380,
    difficulty: 'All Levels',
    popular: true,
  },
  {
    id: 'mathematics',
    title: 'Mathematics',
    icon: <Zap className="w-6 h-6" />,
    count: 220,
    difficulty: 'All Levels',
    popular: false,
  },
  {
    id: 'artificial-intelligence',
    title: 'Artificial Intelligence',
    icon: <Brain className="w-6 h-6" />,
    count: 180,
    difficulty: 'All Levels',
    popular: false,
  },
]

const PROGRAMMING_LANGUAGES = [
  { id: 'c', title: 'C', icon: 'C', problems: 450 },
  { id: 'cpp', title: 'C++', icon: '++', problems: 520 },
  { id: 'java', title: 'Java', icon: 'J', problems: 580 },
  { id: 'python', title: 'Python', icon: 'P', problems: 640 },
  { id: 'ruby', title: 'Ruby', icon: 'R', problems: 380 },
  { id: 'sql', title: 'SQL', icon: 'S', problems: 320 },
  { id: 'databases', title: 'Databases', icon: 'D', problems: 290 },
  { id: 'linux-shell', title: 'Linux Shell', icon: 'L', problems: 210 },
  { id: 'functional-programming', title: 'Functional Programming', icon: 'F', problems: 180 },
  { id: 'regex', title: 'Regex', icon: 'R', problems: 150 },
  { id: 'react', title: 'React', icon: 'A', problems: 320 },
]

export default function PreparePage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Prepare for Your Interview</h1>
        <p className="text-muted-foreground">
          Master coding skills and prepare for technical interviews with comprehensive prep kits and practice challenges
        </p>
      </div>

      {/* Prep Kits */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Prep Kits</h2>
        <Card className="p-6 border-border/40 bg-card/50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">{PREP_KITS[0].title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{PREP_KITS[0].description}</p>
            </div>
            <Badge className="text-xs">{PREP_KITS[0].difficulty}</Badge>
          </div>

          <div className="grid grid-cols-4 gap-4 py-4 border-y border-border/40">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{PREP_KITS[0].challenges}</p>
              <p className="text-xs text-muted-foreground">Practice Challenges</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{PREP_KITS[0].mockTests}</p>
              <p className="text-xs text-muted-foreground">Mock Test</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{PREP_KITS[0].mockInterviews}</p>
              <p className="text-xs text-muted-foreground">Mock Interviews</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{PREP_KITS[0].certification}</p>
              <p className="text-xs text-muted-foreground">Role Certification</p>
            </div>
          </div>

          <div className="pt-4">
            <Button asChild className="w-full gap-2 md:w-auto">
              <Link href="/dashboard/challenges">
                {PREP_KITS[0].cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Practice Skills - Domains/Algorithms */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Practice Skills</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRACTICE_CATEGORIES.map((category) => (
            <Button
              key={category.id}
              asChild
              variant="outline"
              className="h-auto p-6 flex flex-col items-start justify-start gap-3"
            >
              <Link href={`/dashboard/challenges?category=${category.id}`}>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {category.icon}
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{category.title}</p>
                  <p className="text-xs text-muted-foreground">{category.count} problems</p>
                </div>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Programming Languages */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Programming Languages</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {PROGRAMMING_LANGUAGES.map((lang) => (
            <Button
              key={lang.id}
              asChild
              variant="outline"
              className="h-auto p-6 flex flex-col items-center justify-center gap-3 text-center"
            >
              <Link href={`/dashboard/challenges?language=${lang.id}`}>
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center font-bold text-sm text-foreground">
                  {lang.icon}
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground text-sm">{lang.title}</p>
                  <p className="text-xs text-muted-foreground">{lang.problems} problems</p>
                </div>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Get Started CTA */}
      <Card className="p-8 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-2">Start Your Coding Journey</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose a domain and begin practicing with hundreds of problems. Track your progress and unlock achievements as you
              improve your skills.
            </p>
            <Button asChild>
              <Link href="/dashboard/challenges" className="gap-2">
                View All Challenges
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
