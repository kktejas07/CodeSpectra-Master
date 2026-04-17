'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function SystemSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Settings</h1>
        <p className="text-muted-foreground mt-1">Configure system-wide settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">General Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Platform Name</label>
              <Input defaultValue="CodeSpectra" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Support Email</label>
              <Input defaultValue="support@codespectra.com" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Timezone</label>
              <Input defaultValue="UTC" className="mt-1" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Advanced Settings</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-border" />
              <span className="text-sm">Enable User Registrations</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-border" />
              <span className="text-sm">Enable Email Notifications</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="w-4 h-4 rounded border-border" />
              <span className="text-sm">Maintenance Mode</span>
            </label>
          </div>
        </Card>
      </div>

      <Button className="gap-2">
        <Save className="w-4 h-4" />
        Save Settings
      </Button>
    </div>
  )
}
