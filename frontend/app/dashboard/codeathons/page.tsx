'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, Clock, Loader } from 'lucide-react'

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
  status: string
  registered?: boolean
}

export default function CodeathonsPage() {
  const router = useRouter()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', difficulty: '' })

  useEffect(() => {
    fetch('/api/codeathons')
      .then(r => r.json())
      .then(json => { if (json.data) setCodeathons(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = codeathons.filter(c =>
    (!filter.status || c.status === filter.status) &&
    (!filter.difficulty || c.difficulty === filter.difficulty)
  )

  const getStatusColor = (s: string) => {
    if (s === 'upcoming') return 'bg-blue-500/20 text-blue-700'
    if (s === 'ongoing') return 'bg-green-500/20 text-green-700'
    return 'bg-gray-500/20 text-gray-700'
  }

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Codeathons</h1>
        <p className="text-muted-foreground mt-1">Compete in hackathons and coding competitions</p>
      </div>

      {codeathons.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No codeathons available yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(h => (
            <Card key={h.id} className="border-border/60 p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{h.title}</h3>
                <Badge variant="outline" className={getStatusColor(h.status)}>{h.status}</Badge>
              </div>
              <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{h.description}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {h.topics.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
              <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{h.startDate}</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{h.participants}</span>
                <span>{h.totalPrize}</span>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => router.push(`/dashboard/codeathons/${h.id}`)}>
                {h.registered ? 'Manage' : 'Register'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
