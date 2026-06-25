'use client'

import { Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, BookOpen, Volume2, Zap, Star, Clock } from 'lucide-react'
import { parseLearningParams } from '@/lib/learning-query'

interface Course {
  id: string
  title: string
  description: string
  type: 'video' | 'audio' | 'text'
  instructor: string
  duration: string
  level: 'beginner' | 'intermediate' | 'advanced'
  enrolled: number
  rating: number
  progress?: number
  tags: string[]
}

const SAMPLE_COURSES: Course[] = [
  {
    id: '1',
    title: 'React Fundamentals',
    description:
      'Learn React from scratch with comprehensive video lectures and live examples',
    type: 'video',
    instructor: 'Sarah Chen',
    duration: '12 hours',
    level: 'beginner',
    enrolled: 2453,
    rating: 4.8,
    progress: 45,
    tags: ['React', 'JavaScript', 'Web Development'],
  },
  {
    id: '2',
    title: 'Advanced TypeScript Patterns',
    description:
      'Audio course covering advanced TypeScript concepts and design patterns',
    type: 'audio',
    instructor: 'John Smith',
    duration: '8 hours',
    level: 'advanced',
    enrolled: 892,
    rating: 4.9,
    tags: ['TypeScript', 'Design Patterns'],
  },
  {
    id: '3',
    title: 'System Design Interview Guide',
    description: 'Comprehensive text guide for mastering system design interviews',
    type: 'text',
    instructor: 'Alex Kumar',
    duration: '20 lessons',
    level: 'advanced',
    enrolled: 3102,
    rating: 4.7,
    progress: 60,
    tags: ['System Design', 'Interviews'],
  },
  {
    id: '4',
    title: 'Data Structures & Algorithms',
    description:
      'Video course on essential data structures and algorithms with visualizations',
    type: 'video',
    instructor: 'Emma Wilson',
    duration: '18 hours',
    level: 'intermediate',
    enrolled: 4521,
    rating: 4.9,
    progress: 30,
    tags: ['Algorithms', 'Data Structures'],
  },
  {
    id: '5',
    title: 'Web Performance Optimization',
    description:
      'Audio guide to optimizing web applications and improving performance',
    type: 'audio',
    instructor: 'Michael Brown',
    duration: '6 hours',
    level: 'intermediate',
    enrolled: 1203,
    rating: 4.6,
    tags: ['Performance', 'Web Development'],
  },
  {
    id: '6',
    title: 'SQL Mastery Course',
    description:
      'Complete text-based SQL tutorial with real-world examples and best practices',
    type: 'text',
    instructor: 'Lisa Anderson',
    duration: '15 lessons',
    level: 'beginner',
    enrolled: 2891,
    rating: 4.8,
    tags: ['SQL', 'Databases'],
  },
]

function LearningPageInner() {
  const searchParams = useSearchParams()
  const { view, level, type } = useMemo(
    () => parseLearningParams(searchParams),
    [searchParams]
  )

  const filteredCourses = SAMPLE_COURSES.filter((course) => {
    const levelMatch = level === 'all' || course.level === level
    const typeMatch = type === 'all' || course.type === type
    const viewMatch =
      view === 'all' ||
      (view === 'my-courses' && course.progress !== undefined) ||
      view === 'saved'
    return levelMatch && typeMatch && viewMatch
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Learning Hub</h1>
        <p className="text-foreground/60">
          Comprehensive courses to master programming, system design, and technical skills
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCourses.map((course) => (
          <Card
            key={course.id}
            className="overflow-hidden transition-shadow hover:shadow-lg"
          >
            <div className="space-y-4 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {course.type === 'video' && (
                    <Play className="h-4 w-4 text-primary" />
                  )}
                  {course.type === 'audio' && (
                    <Volume2 className="h-4 w-4 text-primary" />
                  )}
                  {course.type === 'text' && (
                    <BookOpen className="h-4 w-4 text-primary" />
                  )}
                  <Badge variant="outline" className="capitalize">
                    {course.level}
                  </Badge>
                </div>
                <Badge>{course.type}</Badge>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-semibold">{course.title}</h3>
                <p className="mb-3 text-sm text-foreground/60">{course.description}</p>
              </div>

              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>{course.rating}</span>
                <span className="text-foreground/40">•</span>
                <span>{course.enrolled.toLocaleString()} enrolled</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Clock className="h-4 w-4" />
                <span>{course.duration}</span>
              </div>

              {course.progress !== undefined && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Progress</span>
                    <span>{course.progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button className="w-full">
                {course.progress !== undefined ? 'Continue' : 'Enroll'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {filteredCourses.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-foreground/60">
            No courses found matching your filters
          </p>
        </Card>
      )}

      <Card className="border border-primary/20 bg-linear-to-r from-primary/10 to-primary/5 p-6">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
          <Zap className="h-5 w-5 text-primary" />
          Tips
        </h3>
        <p className="text-sm text-foreground/70">
          Use the sidebar to switch view, level, and format — same navigation style as Scanner.
          URLs are shareable (e.g. My courses + Intermediate + Video).
        </p>
      </Card>
    </div>
  )
}

export default function LearningPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading learning…</div>
      }
    >
      <LearningPageInner />
    </Suspense>
  )
}
