'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Code2,
  Zap,
  Trophy,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { EmptyArt } from '@/components/visuals/empty-art'

interface ActivityItem {
  ts: string
  type: string
  title: string
  meta: string
  detail: string
}

interface ActivityTimelineProps {
  activities: ActivityItem[]
  limit?: number
  showViewAll?: boolean
  title?: string
  subtitle?: string
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  scan: { icon: Search, color: 'text-emerald-400', bg: 'bg-emerald-500' },
  review: { icon: Code2, color: 'text-teal-400', bg: 'bg-teal-500' },
  fix: { icon: Zap, color: 'text-cyan-400', bg: 'bg-cyan-500' },
  challenge: { icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500' },
  daily: { icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-500' },
  default: { icon: Sparkles, color: 'text-muted-foreground', bg: 'bg-muted-foreground' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return iso.slice(0, 10)
}

function getTypeConfig(type: string) {
  return typeConfig[type] || typeConfig.default
}

export function ActivityTimeline({
  activities,
  limit,
  showViewAll = false,
  title = 'Recent activity',
  subtitle = 'Your latest contributions and actions',
}: ActivityTimelineProps) {
  const displayActivities = limit ? activities.slice(0, limit) : activities

  return (
    <Card className="border-border/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        {showViewAll && (
          <Link href="/dashboard/profile">
            <Badge variant="outline" className="text-xs font-normal gap-1 cursor-pointer">
              View all <ArrowRight className="h-3 w-3" />
            </Badge>
          </Link>
        )}
      </div>

      {displayActivities.length === 0 ? (
        <div className="flex flex-col items-center py-2 text-center" role="status">
          <EmptyArt variant="sessions" className="-my-5 scale-[0.6]" />
          <p className="text-sm font-semibold text-foreground">No recent activity</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Solve a problem or run a scan to see it here.</p>
        </div>
      ) : (
        <div className="relative space-y-0 border-l border-border pl-5">
          {displayActivities.map((item, idx) => {
            const config = getTypeConfig(item.type)
            const Icon = config.icon
            return (
              <div key={idx} className="relative pb-5 last:pb-0">
                <span
                  className={`absolute -left-[21px] top-1 flex h-3.5 w-3.5 rounded-full border-2 border-background ${config.bg}/20`}
                >
                  <span className={`ml-[5px] mt-[5px] h-2 w-2 rounded-full ${config.bg}`} />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <p className="font-medium text-foreground text-sm">{item.title}</p>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{timeAgo(item.ts)}</span>
                  <span>·</span>
                  <span className="truncate max-w-[200px]">{item.detail}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showViewAll && activities.length > (limit || 0) && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <Link href="/dashboard/profile">
            <Badge variant="outline" className="w-full justify-center gap-2 cursor-pointer">
              View all {activities.length} activities <ArrowRight className="h-3 w-3" />
            </Badge>
          </Link>
        </div>
      )}
    </Card>
  )
}