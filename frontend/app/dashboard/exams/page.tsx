'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, BookOpen, Award, Play } from 'lucide-react'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  passingScore: number
  description: string
  date?: string
  status: 'available' | 'in_progress' | 'completed'
  score?: number
}

export default function ExamsPage() {
  const [exams] = useState<Exam[]>([
    {
      id: '1',
      title: 'JavaScript Fundamentals',
      subject: 'JavaScript',
      level: 'Beginner',
      duration: 60,
      questions: 50,
      passingScore: 70,
      description: 'Test your knowledge of JavaScript basics',
      status: 'available',
    },
    {
      id: '2',
      title: 'React Advanced Patterns',
      subject: 'React',
      level: 'Advanced',
      duration: 90,
      questions: 40,
      passingScore: 75,
      description: 'Master advanced React patterns and hooks',
      status: 'available',
    },
    {
      id: '3',
      title: 'Python Data Science',
      subject: 'Python',
      level: 'Intermediate',
      duration: 120,
      questions: 60,
      passingScore: 80,
      description: 'Data science with Python and popular libraries',
      status: 'completed',
      score: 85,
      date: '2024-04-10',
    },
  ])

  const [filter, setFilter] = useState({ level: '', subject: '' })

  const filteredExams = exams.filter(exam => 
    (!filter.level || exam.level === filter.level) &&
    (!filter.subject || exam.subject === filter.subject)
  )

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner':
        return 'bg-green-500/20 text-green-700'
      case 'Intermediate':
        return 'bg-yellow-500/20 text-yellow-700'
      case 'Advanced':
        return 'bg-red-500/20 text-red-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-8 h-8 text-primary" />
          Coding Exams
        </h1>
        <p className="text-muted-foreground mt-2">Test and certify your programming skills</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Level</label>
            <select
              value={filter.level}
              onChange={(e) => setFilter({ ...filter, level: e.target.value })}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
            >
              <option value="">All levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Subject</label>
            <select
              value={filter.subject}
              onChange={(e) => setFilter({ ...filter, subject: e.target.value })}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
            >
              <option value="">All subjects</option>
              <option value="JavaScript">JavaScript</option>
              <option value="React">React</option>
              <option value="Python">Python</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Exams List */}
      <div className="space-y-4">
        {filteredExams.map((exam) => (
          <Card key={exam.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-foreground">{exam.title}</h3>
                  <Badge className={getLevelColor(exam.level)}>{exam.level}</Badge>
                  {exam.status === 'completed' && exam.score && (
                    <Badge className="bg-green-500/20 text-green-700">
                      <Award className="w-3 h-3 mr-1" />
                      {exam.score}%
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mb-3">{exam.description}</p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {exam.duration} mins
                  </span>
                  <span>{exam.questions} questions</span>
                  <span>Pass: {exam.passingScore}%</span>
                </div>
              </div>
              {exam.status === 'available' && (
                <Button className="gap-2">
                  <Play className="w-4 h-4" />
                  Start Exam
                </Button>
              )}
              {exam.status === 'completed' && (
                <Button variant="outline">View Results</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
