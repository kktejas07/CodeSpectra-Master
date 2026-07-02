'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Lock, Shield, Loader } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface SecuritySetting {
  name: string
  status: string
  icon: string
}

const ICONS: Record<string, React.ComponentType<any>> = {
  Lock, Shield, 'alert-triangle': AlertTriangle,
}

export default function Security() {
  const gate = usePageGuard('superadmin')

  const [settings, setSettings] = useState<SecuritySetting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/security')
      .then(r => r.json())
      .then(json => { if (json.data) setSettings(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>
  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Security Settings</h1>
        <p className="text-muted-foreground mt-1">Manage system security configurations</p>
      </div>

      {settings.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Shield className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No security settings configured yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {settings.map(s => {
            const Icon = ICONS[s.icon] || Shield
            return (
              <Card key={s.name} className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Icon className="w-8 h-8 text-primary" />
                  <div>
                    <h3 className="font-medium">{s.name}</h3>
                    <p className={`text-sm mt-1 ${s.status === 'enabled' ? 'text-green-600' : 'text-orange-600'}`}>
                      {s.status === 'enabled' ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>
                <Button variant="outline">Configure</Button>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="p-6 bg-red-500/5 border-red-500/30">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-red-600 mt-1" />
          <div>
            <h3 className="font-medium text-red-600">Recent Security Alerts</h3>
            <p className="text-sm text-muted-foreground mt-1">No recent security alerts detected</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
