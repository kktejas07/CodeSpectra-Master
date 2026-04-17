'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Lock, Shield } from 'lucide-react'

export default function Security() {
  const securitySettings = [
    { name: 'Two-Factor Authentication', status: 'enabled', icon: Lock },
    { name: 'IP Whitelist', status: 'disabled', icon: Shield },
    { name: 'API Rate Limiting', status: 'enabled', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Security Settings</h1>
        <p className="text-muted-foreground mt-1">Manage system security configurations</p>
      </div>

      <div className="space-y-4">
        {securitySettings.map((setting) => {
          const Icon = setting.icon
          return (
            <Card key={setting.name} className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Icon className="w-8 h-8 text-primary" />
                <div>
                  <h3 className="font-medium">{setting.name}</h3>
                  <p className={`text-sm mt-1 ${
                    setting.status === 'enabled' ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {setting.status === 'enabled' ? '✓ Enabled' : '○ Disabled'}
                  </p>
                </div>
              </div>
              <Button variant="outline">Configure</Button>
            </Card>
          )
        })}
      </div>

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
