'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Bell, Mail, Slack } from 'lucide-react'
import { useToast } from '@/lib/toast-context'

interface NotificationPreference {
  id: string
  type: 'email' | 'in_app' | 'slack'
  enabled: boolean
  categories: {
    support: boolean
    billing: boolean
    integrations: boolean
    security: boolean
    updates: boolean
  }
}

export default function NotificationPreferencesPage() {
  const toast = useToast()
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/notifications/preferences')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setPreferences(data)
    } catch (error) {
      console.error('[v0] Failed to fetch preferences:', error)
      toast({
        type: 'error',
        title: 'Failed to load preferences',
        message: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (prefId: string, field: string, value: boolean) => {
    try {
      const res = await fetch(`/api/notifications/preferences/${prefId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (!res.ok) throw new Error('Failed to update')
      toast({
        type: 'success',
        title: 'Preferences updated',
      })
      fetchPreferences()
    } catch (error) {
      console.error('[v0] Failed to update preferences:', error)
      toast({
        type: 'error',
        title: 'Failed to update',
        message: String(error),
      })
    }
  }

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-5 h-5 text-blue-600" />
      case 'slack': return <Slack className="w-5 h-5 text-purple-600" />
      default: return <Bell className="w-5 h-5 text-green-600" />
    }
  }

  const getChannelLabel = (type: string) => {
    switch (type) {
      case 'email': return 'Email Notifications'
      case 'slack': return 'Slack Notifications'
      default: return 'In-App Notifications'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Notification Preferences</h1>
        <p className="text-foreground/60">Control how and when you receive notifications across all channels</p>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <p className="text-foreground/60">Loading preferences...</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {preferences.map((pref) => (
            <Card key={pref.id} className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {getChannelIcon(pref.type)}
                  <div>
                    <h3 className="text-lg font-semibold">{getChannelLabel(pref.type)}</h3>
                    <p className="text-sm text-foreground/60">
                      {pref.type === 'email' && 'Get notifications via email'}
                      {pref.type === 'in_app' && 'Get notifications in the app'}
                      {pref.type === 'slack' && 'Get notifications in Slack'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${pref.enabled ? 'text-green-600' : 'text-foreground/50'}`}>
                    {pref.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={(value) => handleToggle(pref.id, 'enabled', value)}
                  />
                </div>
              </div>

              {pref.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-border">
                  {Object.entries(pref.categories).map(([category, enabled]) => (
                    <div key={category} className="flex items-center justify-between p-3 bg-foreground/5 rounded-lg">
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => handleToggle(pref.id, `categories.${category}`, e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-medium capitalize">{category}</span>
                      </label>
                      <Badge variant={enabled ? 'success' : 'outline'}>
                        {enabled ? 'On' : 'Off'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}

          {/* Email Settings */}
          <Card className="p-6 bg-foreground/5">
            <h3 className="text-lg font-semibold mb-4">Email Digest Options</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                <div>
                  <p className="font-medium">Daily Digest</p>
                  <p className="text-sm text-foreground/60">Get a summary of all notifications daily</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                <div>
                  <p className="font-medium">Weekly Report</p>
                  <p className="text-sm text-foreground/60">Get a weekly activity and usage report</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </Card>

          {/* Quiet Hours */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quiet Hours</h3>
            <p className="text-sm text-foreground/60 mb-4">
              Choose times when you don&apos;t want to receive notifications
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Start Time</label>
                <input
                  type="time"
                  defaultValue="22:00"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">End Time</label>
                <input
                  type="time"
                  defaultValue="08:00"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
            </div>
            <Button className="mt-4">Save Quiet Hours</Button>
          </Card>

          {/* Privacy & Data */}
          <Card className="p-6 border-yellow-500/30">
            <h3 className="text-lg font-semibold mb-4">Privacy & Data</h3>
            <div className="space-y-3 text-sm text-foreground/60">
              <p>Your notification preferences are stored securely and never shared with third parties.</p>
              <p>We only use your email address for notifications. You can unsubscribe at any time.</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
