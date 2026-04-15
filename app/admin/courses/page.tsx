'use client'

import { BookOpen, Plus, Edit2, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

const courses = [
  {
    id: 1,
    title: 'Data Structures Fundamentals',
    difficulty: 'Beginner',
    lessons: 12,
    enrolled: 4521,
    published: true,
  },
  {
    id: 2,
    title: 'Algorithms & Problem Solving',
    difficulty: 'Intermediate',
    lessons: 15,
    enrolled: 2843,
    published: true,
  },
  {
    id: 3,
    title: 'Advanced System Design',
    difficulty: 'Advanced',
    lessons: 10,
    enrolled: 1234,
    published: true,
  },
  {
    id: 4,
    title: 'Web Development Basics',
    difficulty: 'Beginner',
    lessons: 18,
    enrolled: 0,
    published: false,
  },
]

export default function CoursesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Courses</h1>
          </div>
          <p className="text-foreground/60">Manage learning courses</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Course
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Courses</p>
          <p className="text-3xl font-bold text-foreground">{courses.length}</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Published</p>
          <p className="text-3xl font-bold text-foreground">
            {courses.filter((c) => c.published).length}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <p className="text-sm text-foreground/60 mb-1">Total Enrollments</p>
          <p className="text-3xl font-bold text-foreground">
            {courses.reduce((sum, c) => sum + c.enrolled, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Courses Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-card/50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Title</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Difficulty</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Lessons</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Enrolled</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-foreground/70">Status</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-foreground/70">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id} className="border-b border-border last:border-b-0 hover:bg-background/50 transition">
                  <td className="px-6 py-4">
                    <span className="font-medium text-foreground">{course.title}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-foreground/70">{course.difficulty}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-medium text-foreground">{course.lessons}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-foreground/70">{course.enrolled}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        course.published
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {course.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 hover:bg-background rounded transition" title="View">
                        <Eye className="w-4 h-4 text-foreground/60" />
                      </button>
                      <button className="p-2 hover:bg-background rounded transition" title="Edit">
                        <Edit2 className="w-4 h-4 text-foreground/60" />
                      </button>
                      <button className="p-2 hover:bg-background rounded transition" title="Delete">
                        <Trash2 className="w-4 h-4 text-red-400/60" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
