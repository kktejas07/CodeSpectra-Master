'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Activity } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

type ComponentStatus = { name: string; status: 'operational' | 'degraded' | 'down'; latency?: number; message?: string }

export default function StatusPage() {
  const gate = usePageGuard('user')

  const [data, setData] = useState<{ status: string; updated_at: string; components: ComponentStatus[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStatus = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error('Failed to fetch status')
      setData(await res.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])
  if (!gate.ready) return null

  const badge = (status: string) => {
    if (status === 'operational') return <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 className="h-3 w-3" /> Operational</span>
    if (status === 'degraded') return <span className="flex items-center gap-1 text-xs text-yellow-500"><AlertTriangle className="h-3 w-3" /> Degraded</span>
    return <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="h-3 w-3" /> Down</span>
  }

  const overallIcon = data?.status === 'operational' ? 'text-green-500' : data?.status === 'degraded' ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-card ${overallIcon}`}>
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">System Status</h1>
            <p className="text-sm text-muted-foreground">
              {data?.status === 'operational' ? 'All systems operational' : data?.status === 'degraded' ? 'Some systems degraded' : 'System outage detected'}
            </p>
          </div>
        </div>
        <button onClick={fetchStatus} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {data && (
        <>
          <div className="space-y-2">
            {data.components.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.message && <p className="text-xs text-muted-foreground">{c.message}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {c.latency !== undefined && <span className="text-xs text-muted-foreground">{c.latency}ms</span>}
                  {badge(c.status)}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Last checked: {new Date(data.updated_at).toLocaleString()}
          </p>
        </>
      )}
    </div>
  )
}
