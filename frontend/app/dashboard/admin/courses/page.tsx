'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Loader2, Trash2, Pencil, BookOpen, Search } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CourseGeneratorTab from './course-generator-tab'

interface Course {
  id: string
  title: string
  description: string
  type: string
  instructor: string
  duration: string
  level: string
  rating: number
  sessions: number
  enrolled: number
  category: string
  tags: string[]
}

const CATEGORIES = ['Coding', 'Design', 'Business', 'Marketing', 'Data Science', 'AI']
const LEVELS = ['beginner', 'intermediate', 'advanced']

export default function AdminCoursesPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Create Modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'video',
    instructor: 'CodeSpectra',
    level: 'beginner',
    category: 'Coding'
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/courses', { credentials: 'include' })
      const json = await res.json()
      setCourses(json.data || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/admin/courses/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} course${ids.length !== 1 ? 's' : ''} deleted` })
    setCourses((prev) => prev.filter((c) => !ids.includes(c.id)))
  }

  const handleCreate = async () => {
    if (!form.title.trim()) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to create course')
      const json = await res.json()
      
      addToast({ type: 'success', title: 'Course created successfully' })
      setCreateOpen(false)
      
      // Navigate to the curriculum builder
      router.push(`/dashboard/admin/courses/${json.data.id}`)
    } catch {
      addToast({ type: 'error', title: 'Failed to create course' })
    } finally {
      setSaving(false)
    }
  }

  const columns: DataTableColumn<Course>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-semibold text-foreground">{r.title}</span> },
    {
      key: 'level',
      header: 'Level',
      cell: (r) => (
        <Badge variant="outline" className="capitalize">
          {r.level}
        </Badge>
      ),
    },
    { key: 'category', header: 'Category', cell: (r) => r.category },
    { key: 'instructor', header: 'Instructor', cell: (r) => r.instructor },
    { key: 'enrolled', header: 'Enrolled', cell: (r) => r.enrolled?.toString() || '0' },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/admin/courses/${r.id}`)} title="Edit Curriculum">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </Button>
      ),
    },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500/20 via-purple-500/15 to-pink-500/10 border border-indigo-500/20 shadow-sm">
            <BookOpen className="h-6 w-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Course Management</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Create and manage courses, curriculum, and AI-generated video content.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 font-semibold shadow-md"
            onClick={() => {
              setForm({ title: '', description: '', type: 'video', instructor: 'CodeSpectra', level: 'beginner', category: 'Coding' })
              setCreateOpen(true)
            }}
          >
            <Plus className="w-4 h-4" />
            Create Course
          </Button>
        </div>
      </div>

      <Tabs defaultValue="manage" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="manage">Manage Courses</TabsTrigger>
          <TabsTrigger value="generator">AI Course Generator</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-indigo-500" />
              Loading courses...
            </div>
          ) : (
        <DataTable
          columns={columns}
          data={courses}
          searchPlaceholder="Search courses..."
          searchKeys={['title', 'category', 'instructor']}
          filters={[
            {
              label: 'Level',
              key: 'level',
              options: LEVELS.map(l => ({ label: l.charAt(0).toUpperCase() + l.slice(1), value: l })),
            },
          ]}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No courses yet. Click 'Create Course' to get started."
        />
      )}
        </TabsContent>

        <TabsContent value="generator" className="m-0 border-none p-0 outline-none">
          <CourseGeneratorTab />
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Create New Course</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Set basic details. You can add the full curriculum on the next page.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Master Full-Stack Web Development"
                className="h-9 text-sm"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder="Course overview..."
                className="text-sm resize-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Level</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, level: v }))}
                >
                  <SelectTrigger className="h-9 text-sm capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create & Edit Curriculum
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
