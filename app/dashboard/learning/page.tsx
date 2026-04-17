'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, BookOpen, Volume2, Zap, Filter, Star, Clock } from 'lucide-react'

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
    description: 'Learn React from scratch with comprehensive video lectures and live examples',
    type: 'video',
    instructor: 'Sarah Chen',
    duration: '12 hours',
    level: 'beginner',
    enrolled: 2453,
    rating: 4.8,
    progress: 45,
    tags: ['React', 'JavaScript', 'Web Development']
  },
  {
    id: '2',
    title: 'Advanced TypeScript Patterns',
    description: 'Audio course covering advanced TypeScript concepts and design patterns',
    type: 'audio',
    instructor: 'John Smith',
    duration: '8 hours',
    level: 'advanced',
    enrolled: 892,
    rating: 4.9,
    tags: ['TypeScript', 'Design Patterns']
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
    tags: ['System Design', 'Interviews']
  },
  {
    id: '4',
    title: 'Data Structures & Algorithms',
    description: 'Video course on essential data structures and algorithms with visualizations',
    type: 'video',
    instructor: 'Emma Wilson',
    duration: '18 hours',
    level: 'intermediate',
    enrolled: 4521,
    rating: 4.9,
    progress: 30,
    tags: ['Algorithms', 'Data Structures']
  },
  {
    id: '5',
    title: 'Web Performance Optimization',
    description: 'Audio guide to optimizing web applications and improving performance',
    type: 'audio',
    instructor: 'Michael Brown',
    duration: '6 hours',
    level: 'intermediate',
    enrolled: 1203,
    rating: 4.6,
    tags: ['Performance', 'Web Development']
  },
  {
    id: '6',
    title: 'SQL Mastery Course',
    description: 'Complete text-based SQL tutorial with real-world examples and best practices',
    type: 'text',
    instructor: 'Lisa Anderson',
    duration: '15 lessons',
    level: 'beginner',
    enrolled: 2891,
    rating: 4.8,
    tags: ['SQL', 'Databases']
  }
]

export default function LearningPage() {
  const [view, setView] = useState<'all' | 'my-courses' | 'saved'>('all')
  const [filterLevel, setFilterLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'text'>('all')

  const filteredCourses = SAMPLE_COURSES.filter(course => {
    const levelMatch = filterLevel === 'all' || course.level === filterLevel
    const typeMatch = filterType === 'all' || course.type === filterType
    const viewMatch = view === 'all' || (view === 'my-courses' && course.progress !== undefined) || view === 'saved'
    return levelMatch && typeMatch && viewMatch
  })

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-card border border-border rounded-lg p-4 sticky top-20 space-y-6">
          <div>
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Learning
            </h2>
          </div>

          {/* View Filter */}
          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground/70">View</h3>
            <nav className="space-y-1">
              {['all', 'my-courses', 'saved'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                    view === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {v === 'all' && 'All Courses'}
                  {v === 'my-courses' && 'My Courses'}
                  {v === 'saved' && 'Saved'}
                </button>
              ))}
            </nav>
          </div>

          {/* Level Filter */}
          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground/70">Level</h3>
            <nav className="space-y-1">
              {['all', 'beginner', 'intermediate', 'advanced'].map((l) => (
                <button
                  key={l}
                  onClick={() => setFilterLevel(l as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm capitalize ${
                    filterLevel === l
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {l === 'all' ? 'All Levels' : l}
                </button>
              ))}
            </nav>
          </div>

          {/* Type Filter */}
          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground/70">Type</h3>
            <nav className="space-y-1">
              {['all', 'video', 'audio', 'text'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t as any)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm capitalize ${
                    filterType === t
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Learning Hub</h1>
          <p className="text-foreground/60">Comprehensive courses to master programming, system design, and technical skills</p>
        </div>

        {/* Courses Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {course.type === 'video' && <Play className="w-4 h-4 text-primary" />}
                    {course.type === 'audio' && <Volume2 className="w-4 h-4 text-primary" />}
                    {course.type === 'text' && <BookOpen className="w-4 h-4 text-primary" />}
                    <Badge variant="outline" className="capitalize">{course.level}</Badge>
                  </div>
                  <Badge>{course.type}</Badge>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-2">{course.title}</h3>
                  <p className="text-sm text-foreground/60 mb-3">{course.description}</p>
                </div>

                <div className="flex items-center gap-2 text-sm text-foreground/60">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span>{course.rating}</span>
                  <span className="text-foreground/40">•</span>
                  <span>{course.enrolled.toLocaleString()} enrolled</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-foreground/60">
                  <Clock className="w-4 h-4" />
                  <span>{course.duration}</span>
                </div>

                {course.progress !== undefined && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Progress</span>
                      <span>{course.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full" style={{ width: `${course.progress}%` }} />
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
            <p className="text-foreground/60">No courses found matching your filters</p>
          </Card>
        )}
      </div>
    </div>
  )
}

const SAMPLE_COURSES: Course[] = [
  {
    id: '1',
    title: 'React Fundamentals',
    description: 'Learn React from scratch with comprehensive video lectures and live examples',
    type: 'video',
    instructor: 'Sarah Chen',
    duration: '12 hours',
    level: 'beginner',
    enrolled: 2453,
    rating: 4.8,
    progress: 45,
    tags: ['React', 'JavaScript', 'Web Development']
  },
  {
    id: '2',
    title: 'Advanced TypeScript Patterns',
    description: 'Audio course covering advanced TypeScript concepts and design patterns',
    type: 'audio',
    instructor: 'John Smith',
    duration: '8 hours',
    level: 'advanced',
    enrolled: 892,
    rating: 4.9,
    tags: ['TypeScript', 'Design Patterns']
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
    tags: ['System Design', 'Interviews']
  },
  {
    id: '4',
    title: 'Data Structures & Algorithms',
    description: 'Video course on essential data structures and algorithms with visualizations',
    type: 'video',
    instructor: 'Emma Wilson',
    duration: '18 hours',
    level: 'intermediate',
    enrolled: 4521,
    rating: 4.9,
    progress: 30,
    tags: ['Algorithms', 'Data Structures']
  },
  {
    id: '5',
    title: 'Web Performance Optimization',
    description: 'Audio guide to optimizing web applications and improving performance',
    type: 'audio',
    instructor: 'Michael Brown',
    duration: '6 hours',
    level: 'intermediate',
    enrolled: 1203,
    rating: 4.6,
    tags: ['Performance', 'Web Development']
  },
  {
    id: '6',
    title: 'SQL Mastery Course',
    description: 'Complete text-based SQL tutorial with real-world examples and best practices',
    type: 'text',
    instructor: 'Lisa Anderson',
    duration: '15 lessons',
    level: 'beginner',
    enrolled: 2891,
    rating: 4.8,
    tags: ['SQL', 'Databases']
  }
]

export default function LearningPage() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'video' | 'audio' | 'text'>('all')
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all')

  const filteredCourses = SAMPLE_COURSES.filter(course => {
    const typeMatch = selectedFilter === 'all' || course.type === selectedFilter
    const levelMatch = selectedLevel === 'all' || course.level === selectedLevel
    return typeMatch && levelMatch
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="w-5 h-5" />
      case 'audio':
        return <Volume2 className="w-5 h-5" />
      case 'text':
        return <BookOpen className="w-5 h-5" />
      default:
        return null
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video':
        return 'bg-red-100 text-red-800'
      case 'audio':
        return 'bg-blue-100 text-blue-800'
      case 'text':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const stats = [
    { label: 'Total Courses', value: SAMPLE_COURSES.length, icon: <BookOpen className="w-6 h-6" /> },
    { label: 'Enrolled', value: '3 courses', icon: <Zap className="w-6 h-6" /> },
    { label: 'Learning Hours', value: '45 hours', icon: <Clock className="w-6 h-6" /> }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Learning Hub</h1>
        <p className="text-foreground/60">Explore video, audio, and text-based courses to enhance your skills</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                {stat.icon}
              </div>
              <div>
                <p className="text-sm text-foreground/60 mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-foreground/60" />
          <h2 className="font-semibold text-foreground">Filter Courses</h2>
        </div>

        <Tabs defaultValue="type" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="type">By Type</TabsTrigger>
            <TabsTrigger value="level">By Level</TabsTrigger>
          </TabsList>

          <TabsContent value="type" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {['all', 'video', 'audio', 'text'].map((type) => (
                <Button
                  key={type}
                  variant={selectedFilter === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedFilter(type as any)}
                  className="gap-2"
                >
                  {type === 'all' && '📚 All Courses'}
                  {type === 'video' && '▶️ Video'}
                  {type === 'audio' && '🎧 Audio'}
                  {type === 'text' && '📖 Text'}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="level" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {['all', 'beginner', 'intermediate', 'advanced'].map((level) => (
                <Button
                  key={level}
                  variant={selectedLevel === level ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedLevel(level as any)}
                >
                  {level === 'all' && 'All Levels'}
                  {level === 'beginner' && 'Beginner'}
                  {level === 'intermediate' && 'Intermediate'}
                  {level === 'advanced' && 'Advanced'}
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Courses Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">
          {filteredCourses.length} Courses Available
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-6 space-y-4">
                {/* Type Badge */}
                <div className="flex items-center justify-between">
                  <Badge className={`gap-1 ${getTypeColor(course.type)}`}>
                    {getTypeIcon(course.type)}
                    {course.type.charAt(0).toUpperCase() + course.type.slice(1)}
                  </Badge>
                  <Badge variant="outline">{course.level}</Badge>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="font-bold text-lg text-foreground mb-2">{course.title}</h3>
                  <p className="text-sm text-foreground/60 leading-relaxed">{course.description}</p>
                </div>

                {/* Instructor & Duration */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-foreground/60">
                    <p className="font-semibold text-foreground">{course.instructor}</p>
                    <p>Instructor</p>
                  </div>
                  <div className="text-foreground/60 text-right">
                    <p className="font-semibold text-foreground">{course.duration}</p>
                    <p>Duration</p>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {course.tags.slice(0, 2).map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-foreground/60 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-1">
                    <Users2 className="w-3 h-3" />
                    <span>{course.enrolled.toLocaleString()} enrolled</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <span>{course.rating}</span>
                  </div>
                </div>

                {/* Progress Bar (if enrolled) */}
                {course.progress !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground/60">Progress</span>
                      <span className="font-semibold text-foreground">{course.progress}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* CTA Button */}
                <Button className="w-full">
                  {course.progress !== undefined ? 'Continue Learning' : 'Enroll Now'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
