'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'

export interface MetricData {
  label: string
  value: number | string
  unit?: string
  change?: number
  trend?: 'up' | 'down' | 'stable'
  icon?: React.ReactNode
  color?: 'primary' | 'success' | 'warning' | 'danger'
}

interface MetricsCardProps {
  metrics: MetricData[]
  columns?: 2 | 3 | 4
}

export function MetricsCard({ metrics, columns = 4 }: MetricsCardProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-500" />
    }
  }

  const getTrendColor = (trend?: string) => {
    switch (trend) {
      case 'up':
        return 'text-green-600'
      case 'down':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {metrics.map((metric, idx) => (
        <Card key={idx} className="p-4 bg-card border-border">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {metric.label}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{metric.value}</span>
                {metric.unit && (
                  <span className="text-xs text-muted-foreground">{metric.unit}</span>
                )}
              </div>
            </div>
            {metric.icon}
          </div>

          {metric.change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm font-semibold ${getTrendColor(
              metric.trend
            )}`}>
              {getTrendIcon(metric.trend)}
              <span>{Math.abs(metric.change)}%</span>
              <span className="text-xs font-normal text-muted-foreground">vs last month</span>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
