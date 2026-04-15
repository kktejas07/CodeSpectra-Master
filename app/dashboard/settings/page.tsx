'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Settings, Bell, Lock, Trash2 } from 'lucide-react'

export default function SettingsPage() {
  const [email, setEmail] = useState('user@example.com')
  const [username, setUsername] = useState('username')
  const [language, setLanguage] = useState('javascript')
  const [notifications, setNotifications] = useState(true)

  const handleSave = () => {
    // TODO: Save settings
    alert('Settings saved!')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        </div>
        <p className="text-foreground/60">Manage your account and preferences</p>
      </div>

      {/* Profile Section */}
      <div className="rounded-lg bg-card border border-border p-6 space-y-4">
        <h2 className="text-xl font-bold text-foreground">Profile</h2>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-background border-border text-foreground"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Username</label>
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-background border-border text-foreground"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Preferred Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="typescript">TypeScript</option>
          </select>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-lg bg-card border border-border p-6 space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notifications
        </h2>

        <div className="flex items-center justify-between p-4 bg-background rounded-lg">
          <div>
            <p className="font-medium text-foreground">Challenge Reminders</p>
            <p className="text-sm text-foreground/60">Get notified about daily challenges</p>
          </div>
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            className="w-5 h-5 rounded border-border"
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-background rounded-lg">
          <div>
            <p className="font-medium text-foreground">Achievement Alerts</p>
            <p className="text-sm text-foreground/60">Get notified when you unlock achievements</p>
          </div>
          <input
            type="checkbox"
            defaultChecked
            className="w-5 h-5 rounded border-border"
          />
        </div>
      </div>

      {/* Security */}
      <div className="rounded-lg bg-card border border-border p-6 space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Security
        </h2>

        <Button variant="outline" className="w-full justify-start">
          Change Password
        </Button>

        <Button variant="outline" className="w-full justify-start">
          Two-Factor Authentication
        </Button>

        <div className="p-4 bg-background rounded-lg">
          <p className="text-sm text-foreground/60">Last login: Today at 2:30 PM</p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg bg-red-500/5 border border-red-500/30 p-6 space-y-4">
        <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Danger Zone
        </h2>

        <Button variant="destructive" className="w-full">
          Delete Account
        </Button>

        <p className="text-xs text-foreground/50">
          Warning: Deleting your account is permanent and cannot be undone. All your data will be
          deleted.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex gap-3">
        <Button onClick={handleSave} className="flex-1">
          Save Changes
        </Button>
        <Button variant="outline" className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  )
}
