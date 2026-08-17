'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, Activity, DollarSign, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

export function AiAnalyticsDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/platform/ai-usage')
      .then(res => res.json())
      .then(json => {
        if (json.summary) setData(json)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card className="rounded-xl border-border/60 p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  if (!data) return null

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']

  return (
    <Card className="rounded-xl border-border/60 p-6 mt-6">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">AI Usage Analytics (30 Days)</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-card/40 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Total Tokens</p>
          <p className="text-2xl font-semibold">{data.summary.totalTokens.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg bg-card/40 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Est. Cost</p>
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <p className="text-2xl font-semibold">{data.summary.totalCost.toFixed(4)}</p>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card/40 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Total Requests</p>
          <p className="text-2xl font-semibold">{data.summary.requestsCount.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg bg-card/40 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Avg Latency</p>
          <div className="flex items-center gap-1">
            <Zap className="h-4 w-4 text-amber-500" />
            <p className="text-2xl font-semibold">{data.summary.avgLatency}ms</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium mb-4">Daily Token Usage</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyChartData}>
                <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div>
          <p className="text-sm font-medium mb-4">Usage by Feature</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.featureChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.featureChartData.map((entry: any, index: number) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {data.featureChartData.map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-muted-foreground capitalize">{entry.name.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}
