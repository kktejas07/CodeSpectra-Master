'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, Award } from 'lucide-react'

interface Exam {
  id: string
  title: string
  description: string
  duration: number
  questionCount: number
  participants: number
  passingScore: number
  status: 'available' | 'completed' | 'in-progress'
  yourScore?: number
  lastAttempt?: string
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchExams()
  }, [filter])

  const fetchExams = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/exams?filter=${filter}`)
      const data = await res.json()
      setExams(data)
    } catch (error) {
      console.error('Failed to fetch exams:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartExam = (examId: string) => {
    window.location.href = `/exam/${examId}/take`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exams & Assessments</h1>
        <p className="text-muted-foreground">Test your skills with our assessments</p>
      </div>

      <div className="flex gap-2 mb-6">
        {['all', 'available', 'completed', 'in-progress'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {loading ? (
          <Card className="p-6 text-center">Loading exams...</Card>
        ) : exams.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No exams found</Card>
        ) : (
          exams.map((exam) => (
            <Card key={exam.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{exam.title}</h3>
                  <p className="text-sm text-muted-foreground">{exam.description}</p>
                </div>
                <Badge
                  variant={
                    exam.status === 'completed'
                      ? 'default'
                      : exam.status === 'in-progress'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {exam.status}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Duration</p>
                  <p className="font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {exam.duration} min
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Questions</p>
                  <p className="font-semibold">{exam.questionCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Participants</p>
                  <p className="font-semibold flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {exam.participants}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Passing Score</p>
                  <p className="font-semibold flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    {exam.passingScore}%
                  </p>
                </div>
              </div>

              {exam.yourScore !== undefined && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                  <p className="text-muted-foreground">Your Score: <span className="font-semibold">{exam.yourScore}%</span></p>
                  {exam.lastAttempt && (
                    <p className="text-xs text-muted-foreground">Last attempt: {new Date(exam.lastAttempt).toLocaleDateString()}</p>
                  )}
                </div>
              )}

              <Button
                onClick={() => handleStartExam(exam.id)}
                disabled={exam.status === 'completed'}
                className="w-full"
              >
                {exam.status === 'completed' ? 'Completed' : exam.status === 'in-progress' ? 'Resume' : 'Start Exam'}
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
