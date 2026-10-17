'use client'

import React, { useEffect, useState, use } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Loader2, Trash2, BookOpen, Save, Video, ArrowLeft, Wand2, HelpCircle, GripVertical } from 'lucide-react'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-kit'
import { useRouter } from 'next/navigation'

interface Lesson {
  id: string
  title: string
  slug: string
  description?: string
  url?: string
  duration?: number
  free?: boolean
  type?: 'video' | 'text'
  videoType?: 'youtube' | 'ai'
  content?: string
  script?: any[]
  audioUrl?: string
}

interface Section {
  title: string
  slug: string
  lessons: Lesson[]
  quiz?: Array<{
    id: string
    type: string
    question: string
    options: string[]
    correct: number
    explanation: string
  }>
}

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
  image?: string
  whatYoullLearn?: string[]
  sections?: Section[]
  source?: string
  source_url?: string
  license?: string
}

const CATEGORIES = ['Coding', 'Design', 'Business', 'Marketing', 'Data Science', 'AI']
const LEVELS = ['beginner', 'intermediate', 'advanced']

export default function AdminCourseBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const resolved = use(params)
  const courseId = resolved.id
  
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [generatingQuiz, setGeneratingQuiz] = useState<number | null>(null)
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null)
  const [draggedLesson, setDraggedLesson] = useState<{sIndex: number, lIndex: number} | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/courses/${courseId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        if (json.data) {
          if (!json.data.sections) json.data.sections = []
          if (!json.data.whatYoullLearn) json.data.whatYoullLearn = []
          setCourse(json.data)
        }
      })
      .catch(() => addToast({ type: 'error', title: 'Failed to load course' }))
      .finally(() => setLoading(false))
  }, [courseId, addToast])

  const handleSave = async () => {
    if (!course) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/admin/courses/${course.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(course),
        credentials: 'include'
      })
      if (!res.ok) throw new Error('Failed to save')
      addToast({ type: 'success', title: 'Course saved successfully' })
    } catch {
      addToast({ type: 'error', title: 'Failed to save course' })
    } finally {
      setSaving(false)
    }
  }

  const addSection = () => {
    if (!course) return
    setCourse({
      ...course,
      sections: [...(course.sections || []), { title: 'New module', slug: `module-${Date.now()}`, lessons: [] }]
    })
  }

  const updateSection = (index: number, title: string) => {
    if (!course || !course.sections) return
    const newSections = [...course.sections]
    newSections[index].title = title
    newSections[index].slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    setCourse({ ...course, sections: newSections })
  }

  const removeSection = (index: number) => {
    if (!course || !course.sections) return
    const newSections = [...course.sections]
    newSections.splice(index, 1)
    setCourse({ ...course, sections: newSections })
  }

  const addLesson = (sectionIndex: number) => {
    if (!course || !course.sections) return
    const newSections = [...course.sections]
    newSections[sectionIndex].lessons.push({
      id: crypto.randomUUID(),
      title: 'New lesson',
      slug: `lesson-${Date.now()}`,
      type: 'text',
      videoType: 'youtube',
      free: false,
      duration: 0
    })
    setCourse({ ...course, sections: newSections })
  }

  const updateLesson = (sectionIndex: number, lessonIndex: number, field: keyof Lesson, value: any) => {
    if (!course || !course.sections) return
    const newSections = [...course.sections]
    newSections[sectionIndex].lessons[lessonIndex] = {
      ...newSections[sectionIndex].lessons[lessonIndex],
      [field]: value
    }
    setCourse({ ...course, sections: newSections })
  }

  const removeLesson = (sectionIndex: number, lessonIndex: number) => {
    if (!course || !course.sections) return
    const newSections = [...course.sections]
    newSections[sectionIndex].lessons.splice(lessonIndex, 1)
    setCourse({ ...course, sections: newSections })
  }

  // --- Drag and Drop for Sections ---
  const onSectionDragStart = (e: React.DragEvent, index: number) => {
    setDraggedSectionIndex(index)
  }

  const onSectionDragOver = (e: React.DragEvent) => {
    e.preventDefault() 
  }

  const onSectionDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedSectionIndex === null || draggedSectionIndex === dropIndex || !course) return
    
    const newSections = [...(course.sections || [])]
    const [draggedItem] = newSections.splice(draggedSectionIndex, 1)
    newSections.splice(dropIndex, 0, draggedItem)
    
    setCourse({ ...course, sections: newSections })
    setDraggedSectionIndex(null)
  }

  // --- Drag and Drop for Lessons ---
  const onLessonDragStart = (e: React.DragEvent, sIndex: number, lIndex: number) => {
    e.stopPropagation() 
    setDraggedLesson({ sIndex, lIndex })
  }

  const onLessonDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const onLessonDrop = (e: React.DragEvent, dropSIndex: number, dropLIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedLesson || !course || !course.sections) return
    
    if (draggedLesson.sIndex !== dropSIndex) return
    if (draggedLesson.lIndex === dropLIndex) return

    const newSections = [...course.sections]
    const section = { ...newSections[dropSIndex] }
    const newLessons = [...section.lessons]
    
    const [draggedItem] = newLessons.splice(draggedLesson.lIndex, 1)
    newLessons.splice(dropLIndex, 0, draggedItem)
    
    section.lessons = newLessons
    newSections[dropSIndex] = section
    
    setCourse({ ...course, sections: newSections })
    setDraggedLesson(null)
  }

  const handleGenerateVideo = async (sectionIndex: number, lessonIndex: number) => {
    if (!course || !course.sections) return
    const lesson = course.sections[sectionIndex].lessons[lessonIndex]
    
    if (!lesson.content?.trim()) {
      addToast({ type: 'error', title: 'Please enter lesson text content first' })
      return
    }

    setGenerating(lesson.id)
    try {
      const res = await csrfFetch('/api/admin/courses/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: lesson.content,
          courseId: course.id,
          sectionIndex,
          lessonIndex,
          techStack: course.tags?.[0] || course.title,
        }),
        credentials: 'include'
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate video')
      
      // Update with scene-based script (each scene has its own audio)
      updateLesson(sectionIndex, lessonIndex, 'script', json.script)
      updateLesson(sectionIndex, lessonIndex, 'type', 'video')
      updateLesson(sectionIndex, lessonIndex, 'videoType', 'ai')
      updateLesson(sectionIndex, lessonIndex, 'duration', json.totalDurationSeconds)
      
      // Refresh course data to show saved state
      const updated = await csrfFetch(`/api/admin/courses/${course.id}`, { credentials: 'include' })
      const updatedJson = await updated.json()
      if (updatedJson.data) setCourse(updatedJson.data)
      
      addToast({ type: 'success', title: `Generated ${json.script.length} scenes (${json.totalDurationSeconds}s)` })
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    } finally {
      setGenerating(null)
    }
  }

  const handleGenerateQuiz = async (sectionIndex: number) => {
    if (!course || !course.sections) return
    
    setGeneratingQuiz(sectionIndex)
    try {
      const res = await csrfFetch('/api/admin/courses/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          sectionIndex,
          techStack: course.tags?.[0] || course.title,
        }),
        credentials: 'include'
      })
      
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate quiz')
      
      // Refresh course data
      const updated = await csrfFetch(`/api/admin/courses/${course.id}`, { credentials: 'include' })
      const updatedJson = await updated.json()
      if (updatedJson.data) setCourse(updatedJson.data)
      
      addToast({ type: 'success', title: json.message || `Generated ${json.quiz?.length || 0} questions` })
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    } finally {
      setGeneratingQuiz(null)
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6 pb-20 w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md py-4 z-10 border-b border-border/50">
          <div className="flex items-center gap-4">
            <SkeletonText lines={1} />
          </div>
        </div>
        <div className="space-y-6">
          <SkeletonText lines={2} />
          <SkeletonList count={2} />
        </div>
      </div>
    )
  }

  if (!course) {
    return <div className="p-6 text-muted-foreground">Course not found. It may have been deleted — go back to Courses to pick another one.</div>
  }

  return (
    <div className="space-y-6 pb-20 w-full px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-background/85 py-4 backdrop-blur-md">
        <PageHeader
          icon={<BookOpen />}
          title={course.title}
          description="Course builder: edit the details, then arrange modules, lessons and quizzes."
          actions={
            <>
              <Button variant="outline" size="icon" onClick={() => router.push('/dashboard/admin/courses')} aria-label="Back to courses">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                className="gap-2"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save changes
              </Button>
            </>
          }
          className="mb-0"
        />
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="details">Basic details</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6 bg-card border border-border/70 rounded-3xl p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Course title</Label>
              <Input
                value={course.title}
                onChange={e => setCourse({ ...course, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Instructor</Label>
              <Input
                value={course.instructor}
                onChange={e => setCourse({ ...course, instructor: e.target.value })}
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={course.description}
                onChange={e => setCourse({ ...course, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={course.category}
                onValueChange={(v) => setCourse({ ...course, category: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={course.level}
                onValueChange={(v) => setCourse({ ...course, level: v })}
              >
                <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={course.type || 'video'}
                onValueChange={(v) => setCourse({ ...course, type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video course</SelectItem>
                  <SelectItem value="text">Text course</SelectItem>
                  <SelectItem value="interactive">Interactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Duration (e.g. 40h)</Label>
              <Input
                value={course.duration || ''}
                onChange={e => setCourse({ ...course, duration: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Rating (out of 5)</Label>
              <Input
                type="number"
                step="0.1"
                max="5"
                min="0"
                value={course.rating || 0}
                onChange={e => setCourse({ ...course, rating: parseFloat(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Total sessions</Label>
              <Input
                type="number"
                value={course.sessions || 0}
                onChange={e => setCourse({ ...course, sessions: parseInt(e.target.value) || 0 })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Enrolled count</Label>
              <Input
                type="number"
                value={course.enrolled || 0}
                onChange={e => setCourse({ ...course, enrolled: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Thumbnail image URL</Label>
              <Input
                value={course.image || ''}
                onChange={e => setCourse({ ...course, image: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input
                value={course.tags?.join(', ') || ''}
                onChange={e => setCourse({ ...course, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="React, Next.js, Web"
              />
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <Label>What you&apos;ll learn (one per line)</Label>
              <Textarea
                rows={4}
                value={course.whatYoullLearn?.join('\n') || ''}
                onChange={e => setCourse({ ...course, whatYoullLearn: e.target.value.split('\n').filter(Boolean) })}
                placeholder="Master Next.js 14..."
              />
            </div>

            {/* Source Information */}
            <div className="space-y-2">
              <Label>Source or origin</Label>
              <Input
                value={course.source || ''}
                onChange={e => setCourse({ ...course, source: e.target.value })}
                placeholder="e.g. FreeCodeCamp"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Source URL</Label>
              <Input
                value={course.source_url || ''}
                onChange={e => setCourse({ ...course, source_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>License</Label>
              <Input
                value={course.license || ''}
                onChange={e => setCourse({ ...course, license: e.target.value })}
                placeholder="e.g. MIT, CC BY 4.0"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="curriculum" className="space-y-6">
          <div className="flex flex-wrap gap-3 justify-between items-center bg-card border border-border/70 rounded-3xl p-5 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] dark:shadow-none">
            <div>
              <h2 className="font-semibold text-lg">Modules and lessons</h2>
              <p className="text-xs text-muted-foreground">Add modules, then lessons inside each one. Drag to reorder.</p>
            </div>
            <Button onClick={addSection} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> Add module
            </Button>
          </div>

          <div className="space-y-6">
            {course.sections?.map((section, sIndex) => (
              <div 
                key={section.slug || `section-${sIndex}`} 
                className={`bg-card border border-border/70 rounded-3xl overflow-hidden shadow-sm dark:shadow-none transition-[opacity,border-color] duration-200 ${draggedSectionIndex === sIndex ? 'opacity-50 border-primary' : ''}`}
                draggable
                onDragStart={(e) => onSectionDragStart(e, sIndex)}
                onDragOver={onSectionDragOver}
                onDrop={(e) => onSectionDrop(e, sIndex)}
              >
                <div className="bg-muted/30 p-4 border-b border-border flex items-center gap-4">
                  <div className="cursor-grab hover:text-primary text-muted-foreground p-1">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <Input 
                      value={section.title}
                      onChange={e => updateSection(sIndex, e.target.value)}
                      className="font-semibold bg-background/50 text-base"
                      aria-label="Module title"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => addLesson(sIndex)} className="gap-1 text-primary hover:text-primary">
                    <Plus className="w-4 h-4" /> Lesson
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeSection(sIndex)} aria-label="Delete module" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="p-4 space-y-4">
                  {section.lessons.map((lesson, lIndex) => (
                    <div 
                      key={lesson.id || `lesson-${lIndex}`} 
                      className={`border border-border/60 rounded-2xl p-4 bg-background space-y-4 transition-[opacity,border-color] duration-200 hover:border-primary/30 ${draggedLesson?.sIndex === sIndex && draggedLesson?.lIndex === lIndex ? 'opacity-50 border-primary' : ''}`}
                      draggable
                      onDragStart={(e) => onLessonDragStart(e, sIndex, lIndex)}
                      onDragOver={onLessonDragOver}
                      onDrop={(e) => onLessonDrop(e, sIndex, lIndex)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-7 cursor-grab hover:text-primary text-muted-foreground">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Lesson title</Label>
                            <Input 
                              value={lesson.title}
                              onChange={e => updateLesson(sIndex, lIndex, 'title', e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Duration (seconds)</Label>
                            <Input 
                              type="number"
                              value={lesson.duration || ''}
                              onChange={e => updateLesson(sIndex, lIndex, 'duration', Number(e.target.value))}
                              className="h-8"
                            />
                          </div>
                          
                          <div className="md:col-span-2 space-y-1 mt-2">
                            <Label className="text-xs text-muted-foreground">Video source</Label>
                            <Select 
                              value={lesson.videoType || 'youtube'} 
                              onValueChange={(v) => updateLesson(sIndex, lIndex, 'videoType', v)}
                            >
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="youtube">Free YouTube embed</SelectItem>
                                <SelectItem value="ai">Generate AI video</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {(!lesson.videoType || lesson.videoType === 'youtube') ? (
                            <div className="md:col-span-2 space-y-1">
                              <Label className="text-xs text-muted-foreground">Video URL (YouTube embed)</Label>
                              <Input 
                                value={lesson.url || ''}
                                onChange={e => updateLesson(sIndex, lIndex, 'url', e.target.value)}
                                placeholder="https://www.youtube.com/embed/..."
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="md:col-span-2 space-y-1">
                                <Label className="text-xs text-muted-foreground">AI topic or script request</Label>
                                <Textarea 
                                  value={lesson.content || ''}
                                  onChange={e => updateLesson(sIndex, lIndex, 'content', e.target.value)}
                                  placeholder="Write the topic or prompt for AI generation..."
                                  className="resize-y"
                                  rows={3}
                                />
                              </div>
                              <div className="md:col-span-2 flex justify-end gap-2">
                                {lesson.script && <Badge variant="outline" className="self-center mr-auto border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">AI video generated</Badge>}
                                <Button 
                                  variant="default" 
                                  className="gap-2 shrink-0"
                                  onClick={() => handleGenerateVideo(sIndex, lIndex)}
                                  disabled={generating === lesson.id}
                                >
                                  {generating === lesson.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Wand2 className="w-4 h-4" />
                                  )}
                                  Generate with AI
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                        
                        <Button variant="ghost" size="icon" onClick={() => removeLesson(sIndex, lIndex)} aria-label="Delete lesson" className="text-muted-foreground hover:text-destructive shrink-0 mt-6">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {section.lessons.length === 0 && (
                    <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
                      No lessons in this module yet. Select + Lesson above to add one.
                    </div>
                  )}

                  {/* Quiz Section */}
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Module quiz</span>
                        {section.quiz && section.quiz.length > 0 && (
                          <Badge variant="outline" className="text-xs tabular-nums border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">
                            {section.quiz.length} questions
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleGenerateQuiz(sIndex)}
                        disabled={generatingQuiz === sIndex}
                      >
                        {generatingQuiz === sIndex ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        {section.quiz && section.quiz.length > 0 ? 'Regenerate quiz' : 'Generate quiz'}
                      </Button>
                    </div>
                    {section.quiz && section.quiz.length > 0 && (
                      <div className="space-y-2">
                        {section.quiz.slice(0, 3).map((q: any, qi: number) => (
                          <div key={qi} className="text-xs p-2 rounded-lg bg-muted/40 border border-border/40">
                            <span className="font-medium">Q{qi + 1}:</span> {q.question?.slice(0, 80)}...
                          </div>
                        ))}
                        {section.quiz.length > 3 && (
                          <div className="text-xs text-muted-foreground">+{section.quiz.length - 3} more questions</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {(!course.sections || course.sections.length === 0) && (
              <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border rounded-3xl">
                <BookOpen className="w-12 h-12 mb-3 mx-auto opacity-20" />
                <p>Your curriculum is empty. Add a module to start building.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
