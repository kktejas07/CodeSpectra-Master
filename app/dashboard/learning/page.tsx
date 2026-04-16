'use client'

import { BookOpen, Clock, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const courses = [
  {
    id: '1',
    title: 'Data Structures Fundamentals',
    description: 'Master arrays, linked lists, stacks, queues, and trees',
    difficulty: 'Beginner',
    lessons: 12,
    progress: 45,
  },
  {
    id: '2',
    title: 'Algorithms & Problem Solving',
    description: 'Learn sorting, searching, dynamic programming, and graph algorithms',
    difficulty: 'Intermediate',
    lessons: 15,
    progress: 0,
  },
  {
    id: '3',
    title: 'Advanced System Design',
    description: 'Design scalable systems and handle real-world challenges',
    difficulty: 'Advanced',
    lessons: 10,
    progress: 0,
  },
]

export default function LearningPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-semibold text-foreground">Learning Path</h1>
        </div>
        <p className="text-muted-foreground">Master coding concepts with structured courses</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-lg bg-card border border-border space-y-2">
          <p className="text-sm text-muted-foreground">Courses Completed</p>
          <p className="text-3xl font-semibold text-foreground">2</p>
        </div>
        <div className="p-6 rounded-lg bg-card border border-border space-y-2">
          <p className="text-sm text-muted-foreground">Learning Streak</p>
          <p className="text-3xl font-semibold text-foreground">7 days</p>
        </div>
        <div className="p-6 rounded-lg bg-card border border-border space-y-2">
          <p className="text-sm text-muted-foreground">Total Hours</p>
          <p className="text-3xl font-semibold text-foreground">24</p>
        </div>
      </div>

      {/* Courses */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Available Courses</h2>
        <div className="grid grid-cols-1 gap-4">
          {courses.map((course) => (
            <Link key={course.id} href={`/dashboard/learning/${course.id}`}>
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">{course.title}</h3>
                    <p className="text-sm text-muted-foreground">{course.description}</p>
                  </div>
                  <span className="px-3 py-1 rounded text-xs font-medium bg-primary/10 text-primary whitespace-nowrap">
                    {course.difficulty}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      {course.lessons} lessons
                    </div>
                  </div>

                  {course.progress > 0 && (
                    <div className="w-40">
                      <div className="text-xs text-muted-foreground mb-2">{course.progress}% complete</div>
                      <div className="w-full bg-border rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
