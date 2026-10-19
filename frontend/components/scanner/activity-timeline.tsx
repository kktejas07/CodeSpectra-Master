import { useState } from 'react'
import { formatDateTime } from '@/lib/format-datetime'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Filter, Download } from 'lucide-react'

interface Activity {
  id: string
  eventType: 'scan_completed' | 'issue_created' | 'issue_resolved' | 'gate_passed' | 'gate_failed'
  user: string
  description: string
  timestamp: Date
  details?: Record<string, any>
}

interface ActivityTimelineProps {
  activities?: Activity[]
  loading?: boolean
}

export function ActivityTimeline({ activities = [], loading = false }: ActivityTimelineProps) {
  const [filterType, setFilterType] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const getEventIcon = (type: string) => {
    const icons: Record<string, string> = {
      scan_completed: '✓',
      issue_created: '⚠',
      issue_resolved: '✓',
      gate_passed: '✓',
      gate_failed: '✗',
    }
    return icons[type] || '•'
  }

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      scan_completed: 'bg-blue-500/20 text-blue-600',
      issue_created: 'bg-yellow-500/20 text-yellow-600',
      issue_resolved: 'bg-green-500/20 text-green-600',
      gate_passed: 'bg-green-500/20 text-green-600',
      gate_failed: 'bg-red-500/20 text-red-600',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-600'
  }

  const filteredActivities = activities.filter((act) => {
    const typeMatch = filterType === 'all' || act.eventType === filterType
    const startMatch = !startDate || new Date(act.timestamp) >= new Date(startDate)
    const endMatch = !endDate || new Date(act.timestamp) <= new Date(endDate)
    return typeMatch && startMatch && endMatch
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="sr-only">Activity timeline</h2>
        <p className="text-sm text-muted-foreground">View all code analysis and quality gate events</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-2">Event Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            >
              <option value="all">All Events</option>
              <option value="scan_completed">Scans Completed</option>
              <option value="issue_created">Issues Created</option>
              <option value="issue_resolved">Issues Resolved</option>
              <option value="gate_passed">Quality Gates Passed</option>
              <option value="gate_failed">Quality Gates Failed</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground"
            />
          </div>

          <Button variant="outline" className="gap-2" onClick={() => {
            const json = JSON.stringify(filteredActivities, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `scan-activities-${new Date().toISOString().slice(0,10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </Card>

      {/* Timeline */}
      <div className="space-y-2">
        {loading ? (
          <Card className="rounded-3xl p-8 text-center">
            <p className="text-muted-foreground">Loading activities...</p>
          </Card>
        ) : filteredActivities.length === 0 ? (
          <Card className="rounded-3xl p-8 text-center border-dashed">
            <Calendar className="w-12 h-12 text-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No activities found</p>
          </Card>
        ) : (
          filteredActivities.map((activity, idx) => (
            <div key={activity.id} className="relative">
              {idx !== filteredActivities.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-border" />
              )}

              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex gap-4">
                  {/* Timeline dot */}
                  <div className={`mt-1 w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${getEventColor(activity.eventType)}`}>
                    {getEventIcon(activity.eventType)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-foreground">{activity.description}</h3>
                        <p className="text-sm text-muted-foreground">by {activity.user}</p>
                      </div>
                      <Badge variant="outline" className={getEventColor(activity.eventType)}>
                        {activity.eventType.replace(/_/g, ' ')}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDateTime(activity.timestamp)}
                    </p>

                    {activity.details && (
                      <div className="mt-3 p-2 bg-background rounded text-xs text-foreground/70 space-y-1">
                        {Object.entries(activity.details).map(([key, value]) => (
                          <div key={key} className="wrap-break-word">
                            <span className="font-medium">{key}:</span> {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
