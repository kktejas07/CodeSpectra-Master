'use client'

import { Card } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'

export interface TimelineEntry {
  date: string
  title: string
  description: string
  status: 'completed' | 'in-progress' | 'pending'
  metrics?: {
    qualityScore?: number
    issuesResolved?: number
    timeSpent?: string
  }
}

interface CodeQualityTimelineProps {
  entries: TimelineEntry[]
}

export function CodeQualityTimeline({ entries }: CodeQualityTimelineProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500/20 text-green-600'
      case 'in-progress':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-600'
      case 'pending':
        return 'bg-gray-500/10 border-gray-500/20 text-gray-600'
      default:
        return 'bg-gray-500/10 border-gray-500/20'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓ Completed'
      case 'in-progress':
        return '⋯ In Progress'
      case 'pending':
        return '○ Pending'
      default:
        return status
    }
  }

  return (
    <div className="space-y-4">
      {entries.map((entry, index) => (
        <div key={index} className="flex gap-4">
          {/* Timeline Line */}
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full ${
                entry.status === 'completed'
                  ? 'bg-green-500'
                  : entry.status === 'in-progress'
                    ? 'bg-blue-500'
                    : 'bg-gray-400'
              }`}
            />
            {index < entries.length - 1 && (
              <div className="w-0.5 h-16 bg-border mt-2" />
            )}
          </div>

          {/* Content */}
          <Card className="flex-1 p-4 bg-card border-border">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{entry.date}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded border ${getStatusColor(
                  entry.status
                )}`}>
                  {getStatusLabel(entry.status)}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground">{entry.description}</p>

              {/* Metrics */}
              {entry.metrics && (
                <div className="flex gap-3 pt-2 border-t border-border/50">
                  {entry.metrics.qualityScore !== undefined && (
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Quality Score</p>
                      <p className="text-green-600">{entry.metrics.qualityScore}%</p>
                    </div>
                  )}
                  {entry.metrics.issuesResolved !== undefined && (
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Issues Resolved</p>
                      <p className="text-blue-600">{entry.metrics.issuesResolved}</p>
                    </div>
                  )}
                  {entry.metrics.timeSpent && (
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Time Spent</p>
                      <p className="text-amber-600">{entry.metrics.timeSpent}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      ))}
    </div>
  )
}
