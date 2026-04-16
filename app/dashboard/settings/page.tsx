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
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="rounded-lg bg-card border border-border/40 p-8 space-y-6">
        <h2 className="text-xl font-bold text-foreground">Profile</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold text-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background border-border/40 text-foreground h-10"
              placeholder="your@email.com"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-foreground">Username</label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-background border-border/40 text-foreground h-10"
              placeholder="username"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">Preferred Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-background border border-border/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
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
      <div className="rounded-lg bg-card border border-border/40 p-8 space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
          <Bell className="w-5 h-5" />
          Notifications
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-border/20">
            <div>
              <p className="font-medium text-foreground">Challenge Reminders</p>
              <p className="text-sm text-muted-foreground">Get notified about daily challenges</p>
            </div>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              className="w-5 h-5 rounded border-border cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-border/20">
            <div>
              <p className="font-medium text-foreground">Achievement Alerts</p>
              <p className="text-sm text-muted-foreground">Get notified when you unlock achievements</p>
            </div>
            <input
              type="checkbox"
              defaultChecked
              className="w-5 h-5 rounded border-border cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="rounded-lg bg-card border border-border/40 p-8 space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
          <Lock className="w-5 h-5" />
          Security
        </h2>

        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start h-10">
            Change Password
          </Button>

          <Button variant="outline" className="w-full justify-start h-10">
            Two-Factor Authentication
          </Button>
        </div>

        <div className="p-4 bg-background/50 rounded-lg border border-border/20">
          <p className="text-sm text-muted-foreground">Last login: Today at 2:30 PM</p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg bg-red-500/5 border border-red-500/30 p-8 space-y-6">
        <h2 className="text-xl font-bold text-red-400 flex items-center gap-3">
          <Trash2 className="w-5 h-5" />
          Danger Zone
        </h2>

        <Button variant="destructive" className="w-full h-10">
          Delete Account
        </Button>

        <p className="text-xs text-foreground/50 leading-relaxed">
          Warning: Deleting your account is permanent and cannot be undone. All your data will be deleted.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex gap-3 pb-6">
        <Button onClick={handleSave} className="flex-1 h-10">
          Save Changes
        </Button>
        <Button variant="outline" className="flex-1 h-10">
          Cancel
        </Button>
      </div>
    </div>
  )
}
