'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Edit, Trash2, Eye, Users, BarChart3, Play, Volume2, BookOpen } from 'lucide-react'

interface AdminCourse {
  id: string
  title: string
  type: 'video' | 'audio' | 'text'
  instructor: string
  status: 'draft' | 'published' | 'archived'
  enrolledCount: number
  createdDate: string
  lastUpdated: string
}

const ADMIN_COURSES: AdminCourse[] = [
  {
    id: '1',
    title: 'React Fundamentals',
    type: 'video',
    instructor: 'Sarah Chen',
    status: 'published',
    enrolledCount: 2453,
    createdDate: '2024-01-15',
    lastUpdated: '2024-04-10'
  },
  {
    id: '2',
    title: 'Advanced TypeScript Patterns',
    type: 'audio',
    instructor: 'John Smith',
    status: 'published',
    enrolledCount: 892,
    createdDate: '2024-02-20',
    lastUpdated: '2024-03-25'
  },
  {
    id: '3',
    title: 'New Course Draft',
    type: 'text',
    instructor: 'Alex Kumar',
    status: 'draft',
    enrolledCount: 0,
    createdDate: '2024-04-15',
    lastUpdated: '2024-04-16'
  }
]

export default function AdminLearningPage() {
  const [courses, setCourses] = useState<AdminCourse[]>(ADMIN_COURSES)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="w-4 h-4" />
      case 'audio':
        return <Volume2 className="w-4 h-4" />
      case 'text':
        return <BookOpen className="w-4 h-4" />
      default:
        return null
    }
  }

  const publishedCount = courses.filter(c => c.status === 'published').length
  const draftCount = courses.filter(c => c.status === 'draft').length
  const totalEnrolled = courses.reduce((sum, c) => sum + c.enrolledCount, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Learning Management</h1>
          <p className="text-foreground/60">Manage courses, instructors, and learning content</p>
        </div>
        <Button size="lg" className="gap-2" onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-5 h-5" />
          Create Course
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <p className="text-sm text-foreground/60 mb-2">Total Courses</p>
          <p className="text-3xl font-bold text-foreground">{courses.length}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-foreground/60 mb-2">Published</p>
          <p className="text-3xl font-bold text-green-600">{publishedCount}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-foreground/60 mb-2">Drafts</p>
          <p className="text-3xl font-bold text-yellow-600">{draftCount}</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-foreground/60 mb-2">Total Enrolled</p>
          <p className="text-3xl font-bold text-blue-600">{totalEnrolled.toLocaleString()}</p>
        </Card>
      </div>

      {/* Create Course Form */}
      {showCreateForm && (
        <Card className="p-8 border-primary/50 bg-primary/5">
          <h2 className="text-2xl font-bold text-foreground mb-6">Create New Course</h2>
          
          <div className="space-y-6">
            {/* Course Type Selection */}
            <div className="space-y-3">
              <label className="font-semibold text-foreground">Course Type</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { type: 'video', label: 'Video Course', icon: <Play className="w-5 h-5" /> },
                  { type: 'audio', label: 'Audio Course', icon: <Volume2 className="w-5 h-5" /> },
                  { type: 'text', label: 'Text Course', icon: <BookOpen className="w-5 h-5" /> }
                ].map((option) => (
                  <button
                    key={option.type}
                    className="p-4 border-2 border-border rounded-lg hover:border-primary transition text-center"
                  >
                    <div className="text-2xl mb-2">{option.icon}</div>
                    <p className="font-semibold text-sm text-foreground">{option.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Course Title</label>
                <input
                  type="text"
                  placeholder="Enter course title"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Description</label>
                <textarea
                  placeholder="Enter course description"
                  rows={4}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Instructor</label>
                  <input
                    type="text"
                    placeholder="Instructor name"
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Difficulty Level</label>
                  <select className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground">
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Upload Content</label>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-foreground/60 mb-4">Drag and drop your course materials here</p>
                  <Button variant="outline">Browse Files</Button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button className="flex-1">Publish Course</Button>
              <Button variant="outline" className="flex-1">Save as Draft</Button>
              <Button
                variant="ghost"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Courses Table */}
      <Card className="overflow-hidden">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-3 rounded-none border-b">
            <TabsTrigger value="all">All Courses</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="p-6 space-y-4">
            <div className="space-y-4">
              {courses.map((course) => (
                <div key={course.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-primary/20 text-primary gap-1">
                        {getTypeIcon(course.type)}
                        {course.type}
                      </Badge>
                      <Badge variant={course.status === 'published' ? 'default' : 'outline'}>
                        {course.status}
                      </Badge>
                    </div>
                    <h3 className="font-bold text-foreground mb-1">{course.title}</h3>
                    <p className="text-sm text-foreground/60">By {course.instructor}</p>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="font-bold text-foreground">{course.enrolledCount.toLocaleString()}</p>
                      <p className="text-foreground/60 text-xs">Enrolled</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-foreground text-xs">{course.lastUpdated}</p>
                      <p className="text-foreground/60 text-xs">Updated</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-6">
                    <Button size="sm" variant="ghost">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="published" className="p-6">
            <div className="space-y-4">
              {courses.filter(c => c.status === 'published').map((course) => (
                <div key={course.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h3 className="font-bold text-foreground">{course.title}</h3>
                    <p className="text-sm text-foreground/60">By {course.instructor}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{course.enrolledCount.toLocaleString()}</p>
                    <p className="text-sm text-foreground/60">enrolled</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="draft" className="p-6">
            <div className="space-y-4">
              {courses.filter(c => c.status === 'draft').map((course) => (
                <div key={course.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <h3 className="font-bold text-foreground">{course.title}</h3>
                    <p className="text-sm text-foreground/60">By {course.instructor}</p>
                  </div>
                  <Button>Continue Editing</Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
