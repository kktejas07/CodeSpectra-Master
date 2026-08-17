import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { analyticsAiUsage } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  // Ensure the user is a superadmin
  if (gate.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 })
  }

  try {
    const col = await analyticsAiUsage()
    
    // Fetch last 30 days of logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    
    const logs = await col.find({ timestamp: { $gte: thirtyDaysAgo } })
      .sort({ timestamp: -1 })
      .toArray()
      
    // Compute basic aggregates for the dashboard
    const summary = {
      totalTokens: 0,
      totalCost: 0,
      requestsCount: logs.length,
      successCount: 0,
      avgLatency: 0,
      featureBreakdown: {} as Record<string, number>,
      dailyUsage: {} as Record<string, number>
    }
    
    let totalLatency = 0
    
    for (const log of logs) {
      summary.totalTokens += (log.total_tokens || 0)
      summary.totalCost += (log.estimated_cost || 0)
      if (log.success) summary.successCount++
      if (log.latency_ms) totalLatency += log.latency_ms
      
      // Feature breakdown
      const feature = log.feature || 'unknown'
      summary.featureBreakdown[feature] = (summary.featureBreakdown[feature] || 0) + (log.total_tokens || 0)
      
      // Daily breakdown
      if (log.timestamp) {
        const date = log.timestamp.split('T')[0]
        summary.dailyUsage[date] = (summary.dailyUsage[date] || 0) + (log.total_tokens || 0)
      }
    }
    
    if (logs.length > 0) {
      summary.avgLatency = Math.round(totalLatency / logs.length)
    }

    return NextResponse.json({ 
      summary,
      // For chart rendering we transform maps to arrays
      dailyChartData: Object.entries(summary.dailyUsage)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, tokens]) => ({ date, tokens })),
      featureChartData: Object.entries(summary.featureBreakdown)
        .map(([name, value]) => ({ name, value }))
    })

  } catch (e: unknown) {
    console.error('[CodeSpectra] /api/admin/platform/ai-usage GET:', e)
    return NextResponse.json({ error: 'Failed to fetch AI usage data' }, { status: 500 })
  }
}
