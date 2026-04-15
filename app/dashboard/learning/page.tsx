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
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Learning Path</h1>
        </div>
        <p className="text-foreground/60">Master coding concepts with structured courses</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Courses Completed</p>
          <p className="text-2xl font-bold text-foreground">2</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Learning Streak</p>
          <p className="text-2xl font-bold text-foreground">7 days</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Hours</p>
          <p className="text-2xl font-bold text-foreground">24</p>
        </div>
      </div>

      {/* Courses */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Available Courses</h2>
        <div className="grid grid-cols-1 gap-4">
          {courses.map((course) => (
            <Link key={course.id} href={`/dashboard/learning/${course.id}`}>
              <div className="p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition cursor-pointer">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{course.title}</h3>
                    <p className="text-sm text-foreground/60 mt-1">{course.description}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {course.difficulty}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-4 text-sm text-foreground/60">
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      {course.lessons} lessons
                    </div>
                  </div>

                  {course.progress > 0 && (
                    <div className="w-32">
                      <div className="text-xs text-foreground/50 mb-1">{course.progress}%</div>
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
