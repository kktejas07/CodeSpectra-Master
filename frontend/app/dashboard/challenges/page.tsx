'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock, Star, Code, Zap, CheckCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface Challenge {
  id: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  type: 'coding' | 'system-design' | 'behavioral' | 'technical-screen'
  duration: number
  successRate: number
  completed: boolean
  locked: boolean
  prerequisites?: string[]
}

const CHALLENGES: Challenge[] = [
  {
    id: '1',
    title: 'Technical Screen',
    description: 'Practice a recruiter screening to identify gaps in CS fundamentals, role fit, and interview readiness.',
    difficulty: 'Medium',
    type: 'technical-screen',
    duration: 30,
    successRate: 97.58,
    completed: true,
    locked: false,
  },
  {
    id: '2',
    title: 'Coding - Software Engineer',
    description: 'Strengthen problem-solving speed, coding accuracy, and confidence by solving real-world problems.',
    difficulty: 'Hard',
    type: 'coding',
    duration: 60,
    successRate: 94.87,
    completed: false,
    locked: false,
  },
  {
    id: '3',
    title: 'System Design',
    description: 'Improve your ability to design scalable systems and clearly justify architectural decisions.',
    difficulty: 'Hard',
    type: 'system-design',
    duration: 60,
    successRate: 92.15,
    completed: false,
    locked: true,
    prerequisites: ['Coding - Software Engineer'],
  },
  {
    id: '4',
    title: 'Behavioral Interview',
    description: 'Practice behavioral questions in a mock setting. Refine your storytelling and STAR method.',
    difficulty: 'Medium',
    type: 'behavioral',
    duration: 45,
    successRate: 88.45,
    completed: false,
    locked: false,
  },
  {
    id: '5',
    title: 'Coding - Frontend Developer',
    description: 'Master React, JavaScript, and CSS challenges to test your core frontend knowledge.',
    difficulty: 'Medium',
    type: 'coding',
    duration: 60,
    successRate: 91.2,
    completed: false,
    locked: true,
    prerequisites: ['Coding - Software Engineer'],
  },
  {
    id: '6',
    title: 'Coding - Backend Developer',
    description: 'Work on challenges covering Node.js, databases, and backend expertise.',
    difficulty: 'Hard',
    type: 'coding',
    duration: 60,
    successRate: 87.65,
    completed: false,
    locked: true,
    prerequisites: ['Coding - Software Engineer'],
  },
]

export default function ChallengesPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null)

  const filteredChallenges = CHALLENGES.filter((c) => {
    if (selectedType && c.type !== selectedType) return false
    if (selectedDifficulty && c.difficulty !== selectedDifficulty) return false
    return true
  })

  const typeColors = {
    'technical-screen': 'bg-blue-500/10 text-blue-300',
    'coding': 'bg-green-500/10 text-green-300',
    'system-design': 'bg-purple-500/10 text-purple-300',
    'behavioral': 'bg-orange-500/10 text-orange-300',
  }

  const typeIcons = {
    'technical-screen': Code,
    'coding': Zap,
    'system-design': Code,
    'behavioral': Star,
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Mock Interviews & Challenges</h1>
        <p className="text-muted-foreground">Master your skills with AI-powered practice and real interview questions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <p className="text-sm text-muted-foreground">Challenges Completed</p>
          </div>
          <p className="text-2xl font-bold">1 / 6</p>
          <p className="text-xs text-muted-foreground mt-1">Unlock next challenges by completing current ones</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <p className="text-sm text-muted-foreground">Streaks</p>
          </div>
          <p className="text-2xl font-bold">0</p>
          <p className="text-xs text-muted-foreground mt-1">Keep it up to earn rewards</p>
        </Card>
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-purple-500" />
            <p className="text-sm text-muted-foreground">Skills Verified</p>
          </div>
          <p className="text-2xl font-bold">0</p>
          <p className="text-xs text-muted-foreground mt-1">Get certified to showcase expertise</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">Challenge Type</p>
          <div className="flex flex-wrap gap-2">
            {['technical-screen', 'coding', 'system-design', 'behavioral'].map((type) => (
              <Button
                key={type}
                variant={selectedType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedType(selectedType === type ? null : type)}
                className="capitalize"
              >
                {type.replace('-', ' ')}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {['Easy', 'Medium', 'Hard'].map((difficulty) => (
              <Button
                key={difficulty}
                variant={selectedDifficulty === difficulty ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDifficulty(selectedDifficulty === difficulty ? null : difficulty)}
              >
                {difficulty}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Challenges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredChallenges.map((challenge) => {
          const Icon = typeIcons[challenge.type as keyof typeof typeIcons]
          const typeColor = typeColors[challenge.type as keyof typeof typeColors]

          return (
            <Card
              key={challenge.id}
              className={`p-6 border-border/40 relative overflow-hidden group transition-all hover:border-primary/40 ${
                challenge.locked ? 'opacity-60' : ''
              }`}
            >
              {/* Locked Overlay */}
              {challenge.locked && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center">
                    <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">Locked</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Complete {challenge.prerequisites?.[0]} to unlock
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={typeColor} variant="outline">
                        {challenge.type.replace('-', ' ').toUpperCase()}
                      </Badge>
                      {challenge.completed && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                    <h3 className="text-lg font-semibold">{challenge.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-muted-foreground">{challenge.duration} mins</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">{challenge.description}</p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Difficulty</p>
                    <Badge
                      variant="outline"
                      className={
                        challenge.difficulty === 'Easy'
                          ? 'bg-green-500/10'
                          : challenge.difficulty === 'Medium'
                            ? 'bg-yellow-500/10'
                            : 'bg-red-500/10'
                      }
                    >
                      {challenge.difficulty}
                    </Badge>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
                    <p className="text-sm font-semibold">{challenge.successRate}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Badge variant="outline" className={challenge.completed ? 'bg-green-500/10' : 'bg-muted'}>
                      {challenge.completed ? 'Complete' : 'Todo'}
                    </Badge>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  asChild
                  className="w-full gap-2"
                  disabled={challenge.locked}
                  variant={challenge.completed ? 'outline' : 'default'}
                >
                  <Link href={challenge.locked ? '#' : `/dashboard/challenges/${challenge.id}`}>
                    {challenge.completed ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Try Again
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Start Challenge
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Link>
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {filteredChallenges.length === 0 && (
        <Card className="p-12 text-center border-border/40">
          <Code className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">No challenges match your filters</p>
          <Button variant="outline" onClick={() => {
            setSelectedType(null)
            setSelectedDifficulty(null)
          }}>
            Clear Filters
          </Button>
        </Card>
      )}

      {/* Features Overview */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <h3 className="font-semibold mb-4">How It Works</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Progressive Unlocking</p>
            <p className="text-sm text-muted-foreground">Complete challenges to unlock advanced ones and build your skills progressively</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">AI-Powered Feedback</p>
            <p className="text-sm text-muted-foreground">Get detailed feedback and personalized recommendations to improve</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Real Interview Questions</p>
            <p className="text-sm text-muted-foreground">Practice with questions used by top tech companies</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Skills Certification</p>
            <p className="text-sm text-muted-foreground">Earn verified badges to showcase your expertise</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
