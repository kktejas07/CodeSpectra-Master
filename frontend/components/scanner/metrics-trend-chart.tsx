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
      <Card className="bg-card/30 border border-border p-8 text-center">
        <p className="text-sm text-foreground/60">No trend data available</p>
      </Card>
    )
  }

  const getMetricConfig = (m: string) => {
    const configs: Record<string, any> = {
      quality: {
        label: 'Code Quality',
        color: '#3b82f6',
        unit: '',
      },
      bugs: {
        label: 'Bugs Found',
        color: '#ef4444',
        unit: '',
      },
      vulnerabilities: {
        label: 'Vulnerabilities',
        color: '#f97316',
        unit: '',
      },
      complexity: {
        label: 'Complexity Score',
        color: '#ec4899',
        unit: '',
      },
      coverage: {
        label: 'Test Coverage',
        color: '#10b981',
        unit: '%',
      },
    }
    return configs[m] || configs.quality
  }

  const config = getMetricConfig(metric)
  const latestValue = data[data.length - 1]?.[metric as keyof MetricsTrendData]
  const previousValue = data[data.length - 2]?.[metric as keyof MetricsTrendData]
  const trend = latestValue && previousValue ? latestValue - previousValue : 0
  const trendPercentage = previousValue ? Math.round(((latestValue - previousValue) / previousValue) * 100) : 0

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded p-2 text-xs">
          <p className="text-foreground font-semibold">{payload[0].payload.date}</p>
          <p className="text-foreground/70">
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
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Current</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{latestValue}</span>
            <span className="text-xs text-foreground/50">{config.unit}</span>
          </div>
        </Card>

        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Previous</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground/60">{previousValue || 'N/A'}</span>
            <span className="text-xs text-foreground/50">{config.unit}</span>
          </div>
        </Card>

        <Card className="bg-card/30 border border-border p-4">
          <p className="text-xs text-foreground/60 mb-1">Change</p>
          <div className="flex items-center gap-2">
            {trend > 0 ? (
              <TrendingUp className="w-5 h-5 text-red-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-green-500" />
            )}
            <span
              className={`text-xl font-bold ${trend > 0 ? 'text-red-500' : 'text-green-500'}`}
            >
              {trend > 0 ? '+' : ''}{trend}
            </span>
            <span className="text-xs text-foreground/50">
              ({trendPercentage > 0 ? '+' : ''}{trendPercentage}%)
            </span>
          </div>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="bg-card/30 border border-border p-4">
        <h4 className="font-semibold text-foreground mb-4">{config.label} Trend</h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" stroke="var(--color-foreground-60)" />
            <YAxis stroke="var(--color-foreground-60)" />
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
