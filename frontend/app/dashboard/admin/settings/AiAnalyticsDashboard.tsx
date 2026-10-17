'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Activity, DollarSign, Zap, RefreshCw, TrendingUp, BarChart3, Clock, CheckCircle, XCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

interface AiUsageData {
  summary: {
    totalTokens: number
    totalCost: number
    requestsCount: number
    avgLatency: number
    successRate: number
  }
  dailyChartData: Array<{ date: string; tokens: number; cost: number }>
  featureChartData: Array<{ name: string; value: number }>
  modelStats: Array<{
    model: string
    provider: string
    requests: number
    tokens: number
    cost: number
    avgLatency: number
    successRate: number
  }>
  providerStats: Array<{
    provider: string
    requests: number
    tokens: number
    cost: number
  }>
}

export function AiAnalyticsDashboard() {
  const [data, setData] = useState<AiUsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'providers'>('overview')

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/platform/ai-usage', { credentials: 'include' })
      const json = await res.json()
      if (json.summary) setData(json)
    } catch (e) {
      console.error('Failed to fetch AI usage data:', e)
    }
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70 p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    )
  }

  if (!data) return null

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-4))', 'hsl(var(--chart-3))', 'hsl(var(--chart-5))', '#f97316', 'hsl(var(--muted-foreground))']

  return (
    <Card className="rounded-3xl border-border/70 p-6 mt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">AI usage</h3>
          <Badge variant="secondary" className="text-[10px]">Last 30 days</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Total tokens</p>
          <p className="text-2xl font-bold tabular-nums">{data.summary.totalTokens.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Estimated cost</p>
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-2xl font-bold tabular-nums">{data.summary.totalCost.toFixed(4)}</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Total requests</p>
          <p className="text-2xl font-bold tabular-nums">{data.summary.requestsCount.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Avg latency</p>
          <div className="flex items-center gap-1">
            <Zap className="h-4 w-4 text-amber-500" />
            <p className="text-2xl font-bold tabular-nums">{data.summary.avgLatency}ms</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/60">
          <p className="text-xs text-muted-foreground mb-1">Success rate</p>
          <div className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-2xl font-bold tabular-nums">{data.summary.successRate}%</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-border/50">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'models', label: 'By model' },
          { id: 'providers', label: 'By provider' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <p className="text-sm font-medium mb-4">Daily token usage</p>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.dailyChartData}>
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
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
            <p className="text-sm font-medium mb-4">Usage by feature</p>
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
      )}

      {activeTab === 'models' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Usage by model</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Model</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Provider</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Requests</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tokens</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Avg latency</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Success</th>
                </tr>
              </thead>
              <tbody>
                {data.modelStats.map((model, index) => (
                  <tr key={index} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-3 px-4 font-mono text-xs">{model.model}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[10px]">{model.provider}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{model.requests.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{model.tokens.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">${model.cost.toFixed(4)}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{model.avgLatency}ms</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className={model.successRate >= 95 ? 'text-green-600 dark:text-green-400' : model.successRate >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                        {model.successRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Usage by provider</p>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.providerStats}>
                <XAxis dataKey="provider" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.providerStats.map((provider, index) => (
              <div key={index} className="p-4 rounded-2xl bg-muted/30 border border-border/60">
                <p className="text-sm font-medium capitalize">{provider.provider}</p>
                <p className="text-xs text-muted-foreground">{provider.requests.toLocaleString()} requests</p>
                <p className="text-xs text-muted-foreground">{provider.tokens.toLocaleString()} tokens</p>
                <p className="text-xs font-mono text-green-600 dark:text-green-400">${provider.cost.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
