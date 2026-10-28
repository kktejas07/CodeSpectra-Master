'use client'

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface MetricsTrendData {
  date: string
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  complexity: number
  coverage: number
}

interface MetricsTrendChartProps {
  data: MetricsTrendData[]
  metric?: 'quality' | 'bugs' | 'vulnerabilities' | 'complexity' | 'coverage'
}

export function MetricsTrendChart({ data, metric = 'quality' }: MetricsTrendChartProps) {
  if (data.length === 0) {
    return (
      <Card className="rounded-3xl border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No trend data yet. Run a few scans and your quality trend will show up here.</p>
      </Card>
    )
  }

  const getMetricConfig = (m: string) => {
    const configs: Record<string, any> = {
      quality: {
        label: 'Code quality',
        color: 'var(--color-primary)',
        unit: '',
      },
      bugs: {
        label: 'Bugs found',
        color: '#EF4444',
        unit: '',
      },
      vulnerabilities: {
        label: 'Vulnerabilities',
        color: '#F97316',
        unit: '',
      },
      complexity: {
        label: 'Complexity score',
        color: '#EC4899',
        unit: '',
      },
      coverage: {
        label: 'Test coverage',
        color: '#06B6D4',
        unit: '%',
      },
    }
    return configs[m] || configs.quality
  }

  const config = getMetricConfig(metric)
  const latestValue = data[data.length - 1]?.[metric as keyof MetricsTrendData]
  const previousValue = data[data.length - 2]?.[metric as keyof MetricsTrendData]
  const trend = latestValue && previousValue ? Number(latestValue) - Number(previousValue) : 0
  // Higher is better for quality and coverage; lower is better for the rest.
  const higherIsBetter = metric === 'quality' || metric === 'coverage'
  const trendIsGood = higherIsBetter ? trend >= 0 : trend <= 0
  const trendPercentage = previousValue ? Math.round(((Number(latestValue) - Number(previousValue)) / Number(previousValue)) * 100) : 0

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-sm">
          <p className="text-foreground font-semibold">{payload[0].payload.date}</p>
          <p className="tabular-nums text-muted-foreground">
            {payload[0].name}: {payload[0].value}
            {config.unit}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-4">
      {/* Metric Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="gap-0 rounded-3xl p-5">
          <p className="mb-1 text-sm font-medium text-muted-foreground">Current</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-primary">{latestValue}</span>
            <span className="text-xs text-muted-foreground">{config.unit}</span>
          </div>
        </Card>

        <Card className="gap-0 rounded-3xl p-5">
          <p className="mb-1 text-sm font-medium text-muted-foreground">Previous</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-muted-foreground">{previousValue || 'N/A'}</span>
            <span className="text-xs text-muted-foreground">{config.unit}</span>
          </div>
        </Card>

        <Card className="gap-0 rounded-3xl p-5">
          <p className="mb-1 text-sm font-medium text-muted-foreground">Change</p>
          <div className="flex items-center gap-2">
            {trend > 0 ? (
              <TrendingUp className={`w-5 h-5 ${trendIsGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} aria-hidden />
            ) : (
              <TrendingDown className={`w-5 h-5 ${trendIsGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} aria-hidden />
            )}
            <span
              className={`text-xl font-bold tabular-nums ${trendIsGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {trend > 0 ? '+' : ''}{trend}
            </span>
            <span className="text-xs text-muted-foreground">
              ({trendPercentage > 0 ? '+' : ''}{trendPercentage}%)
            </span>
          </div>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="gap-0 rounded-3xl p-5">
        <h4 className="mb-4 font-semibold text-foreground">{config.label} trend</h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              dot={{ fill: config.color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
