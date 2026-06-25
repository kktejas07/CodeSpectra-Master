'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, Code2, UserPlus } from 'lucide-react'

interface Codeathon {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  totalPrize: string
  participants: number
  difficulty: string
  topics: string[]
  status: 'upcoming' | 'ongoing' | 'ended'
  registered?: boolean
}

export default function CodeathonsPage() {
  const [codeathons] = useState<Codeathon[]>([
    {
      id: '1',
      title: 'Web Development Challenge 2024',
      description: 'Build an innovative web application',
      startDate: '2024-05-01',
      endDate: '2024-05-31',
      totalPrize: '$5,000',
      participants: 342,
      difficulty: 'Intermediate',
      topics: ['React', 'Node.js', 'MongoDB'],
      status: 'upcoming',
      registered: false,
    },
    {
      id: '2',
      title: 'AI/ML Hackathon',
      description: 'Create AI solutions for real-world problems',
      startDate: '2024-04-20',
      endDate: '2024-04-22',
      totalPrize: '$10,000',
      participants: 128,
      difficulty: 'Advanced',
      topics: ['Machine Learning', 'Python', 'TensorFlow'],
      status: 'ongoing',
      registered: true,
    },
    {
      id: '3',
      title: 'Mobile App Sprint',
      description: 'Build cross-platform mobile applications',
      startDate: '2024-03-15',
      endDate: '2024-03-22',
      totalPrize: '$3,000',
      participants: 256,
      difficulty: 'Intermediate',
      topics: ['React Native', 'Flutter', 'Swift'],
      status: 'ended',
      registered: true,
    },
  ])

  const [filter, setFilter] = useState({ status: '', difficulty: '' })

  const filteredCodeathons = codeathons.filter(c =>
    (!filter.status || c.status === filter.status) &&
    (!filter.difficulty || c.difficulty === filter.difficulty)
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-500/20 text-blue-700'
      case 'ongoing':
        return 'bg-green-500/20 text-green-700'
      case 'ended':
        return 'bg-gray-500/20 text-gray-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-8 h-8 text-primary" />
          Coding Competitions
        </h1>
        <p className="text-muted-foreground mt-2">Join codeathons and compete with developers worldwide</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
            >
              <option value="">All events</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="ended">Ended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Difficulty</label>
            <select
              value={filter.difficulty}
              onChange={(e) => setFilter({ ...filter, difficulty: e.target.value })}
              className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
            >
              <option value="">All levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Codeathons List */}
      <div className="space-y-4">
        {filteredCodeathons.map((codeathon) => (
          <Card key={codeathon.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-foreground">{codeathon.title}</h3>
                  <Badge className={getStatusColor(codeathon.status)}>
                    {codeathon.status.charAt(0).toUpperCase() + codeathon.status.slice(1)}
                  </Badge>
                </div>
                <p className="text-muted-foreground mb-3">{codeathon.description}</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {codeathon.topics.map((topic) => (
                    <Badge key={topic} variant="outline" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {codeathon.startDate} to {codeathon.endDate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    Prize Pool: {codeathon.totalPrize}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {codeathon.participants} participants
                  </span>
                </div>
              </div>
              {codeathon.status === 'upcoming' && (
                <Button className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Register
                </Button>
              )}
              {codeathon.status === 'ongoing' && codeathon.registered && (
                <Button className="gap-2">
                  <Code2 className="w-4 h-4" />
                  Start Coding
                </Button>
              )}
              {codeathon.status === 'ended' && codeathon.registered && (
                <Button variant="outline">View Results</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
