'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface HealthCheck {
  status: string
  timestamp: string
  checks: Record<string, string>
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health')
        const json = await res.json()
        setHealth(json)
      } catch {
        setError('Failed to fetch status')
      } finally {
        setLoading(false)
      }
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System Status</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Real-time operational status of CodeSpectra services.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking status…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-6 py-12 text-center">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : health ? (
          <div className="space-y-4">
            <div
              className={`flex items-center gap-3 rounded-xl border px-6 py-4 ${
                health.status === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-amber-500/30 bg-amber-500/10'
              }`}
            >
              {health.status === 'ok' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <XCircle className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {health.status === 'ok' ? 'All Systems Operational' : 'Degraded Performance'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last checked: {new Date(health.timestamp).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60">
              <div className="border-b border-border/60 px-6 py-3">
                <h2 className="text-sm font-semibold text-foreground">Services</h2>
              </div>
              <div className="divide-y divide-border/60">
                {Object.entries(health.checks).map(([service, status]) => (
                  <div key={service} className="flex items-center justify-between px-6 py-3.5">
                    <span className="text-sm font-medium capitalize text-foreground">{service}</span>
                    {status === 'ok' ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" />
                        Operational
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
                        <XCircle className="h-4 w-4" />
                        {status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
