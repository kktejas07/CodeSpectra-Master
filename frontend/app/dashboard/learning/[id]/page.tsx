'use client'

import { useState } from 'react'
import { BookOpen, CheckCircle, Play, Download, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast-context'

const lessons = [
  {
    id: 1,
    title: 'Introduction to Arrays',
    duration: '15 min',
    completed: true,
  },
  {
    id: 2,
    title: 'Array Operations: Insert & Delete',
    duration: '20 min',
    completed: true,
  },
  {
    id: 3,
    title: 'Linked Lists Basics',
    duration: '18 min',
    completed: true,
  },
  {
    id: 4,
    title: 'Linked List Operations',
    duration: '22 min',
    completed: false,
  },
  {
    id: 5,
    title: 'Stacks & Queues',
    duration: '25 min',
    completed: false,
  },
]

export default function CoursePage({ params }: { params: { id: string } }) {
  const addToast = useToast()
  const [activeLesson, setActiveLesson] = useState(1)
  const completed = lessons.filter((l) => l.completed).length

  const currentLesson = lessons.find((l) => l.id === activeLesson) || lessons[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Data Structures Fundamentals</h1>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
            Beginner
          </span>
          <span className="text-sm text-foreground/60">{completed} of {lessons.length} lessons completed</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-foreground">Course Progress</span>
          <span className="text-foreground/60">{Math.round((completed / lessons.length) * 100)}%</span>
        </div>
        <div className="w-full bg-border rounded-full h-3">
          <div
            className="bg-primary h-3 rounded-full transition-all"
            style={{ width: `${(completed / lessons.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
         {/* Content Section */}
         <div className="lg:col-span-3 space-y-4">
           <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-border flex items-center justify-center">
             <div className="text-center px-6">
               <BookOpen className="w-12 h-12 text-primary/40 mx-auto mb-3" />
               <p className="text-foreground/70 font-medium">{currentLesson.title}</p>
               <p className="text-sm text-muted-foreground mt-1">Reading material below</p>
             </div>
           </div>

          {/* Lesson Content */}
          <div className="rounded-lg bg-card border border-border p-6 space-y-4">
            <h2 className="text-2xl font-bold text-foreground">{currentLesson.title}</h2>
            
            <div className="prose prose-invert max-w-none space-y-4">
              <div className="text-foreground/70 space-y-3">
                <p>
                  In this lesson, we'll explore the fundamentals of {(currentLesson.title || '').toLowerCase()}.
                  This is a crucial concept for understanding more advanced data structures.
                </p>

                <h3 className="text-lg font-semibold text-foreground">Key Concepts</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>Basic structure and organization</li>
                  <li>Time and space complexity analysis</li>
                  <li>Common operations and use cases</li>
                  <li>Real-world applications</li>
                </ul>

                <h3 className="text-lg font-semibold text-foreground">Learning Objectives</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>Understand the core principles</li>
                  <li>Implement basic operations</li>
                  <li>Analyze performance characteristics</li>
                  <li>Solve practical problems</li>
                </ul>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm">
                    <strong>Tip:</strong> Try to visualize how the operations work step-by-step.
                    This will help you understand the underlying mechanics better.
                  </p>
                </div>
              </div>
            </div>

            {/* Lesson Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button className="flex-1" size="sm">
                <CheckCircle className="w-4 h-4 mr-2" />
                Mark as Complete
              </Button>
              <Button variant="outline" className="flex-1" size="sm" onClick={() => addToast({ type: 'info', title: 'Coming soon', message: 'Downloadable notes will be available soon!' })}>
                <Download className="w-4 h-4 mr-2" />
                Download Notes
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar - Lessons List */}
        <div className="space-y-4">
          <div className="rounded-lg bg-card border border-border p-4 space-y-3">
            <h3 className="font-bold text-foreground">Course Content</h3>
            
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  onClick={() => setActiveLesson(lesson.id)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    activeLesson === lesson.id
                      ? 'bg-primary/20 border border-primary'
                      : 'hover:bg-background'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {lesson.completed && (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        {lesson.title}
                      </p>
                      <p className="text-xs text-foreground/50 mt-1">{lesson.duration}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Discussion */}
          <div className="rounded-lg bg-card border border-border p-4">
            <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Discussion
            </h3>
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => addToast({ type: 'info', title: 'Coming soon', message: 'Q&A feature will be available soon!' })}>
              Ask a Question
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
