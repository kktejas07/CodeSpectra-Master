'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Settings, Moon, Sun, Globe, Palette } from 'lucide-react'

export default function SettingsPage() {
  const [theme, setTheme] = useState('light')
  const [language, setLanguage] = useState('en')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'auto', label: 'Auto', icon: Palette },
  ]

  const languages = [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Español' },
    { id: 'fr', label: 'Français' },
    { id: 'de', label: 'Deutsch' },
    { id: 'zh', label: '中文' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-8 h-8 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">Customize your experience</p>
      </div>

      {/* Theme Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Appearance</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {themes.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`p-3 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                      theme === t.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Language Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Language & Region</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Notification Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive email updates about your activity</p>
            </div>
            <button
              onClick={() => setEmailNotifications(!emailNotifications)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                emailNotifications ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  emailNotifications ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-border pt-4" />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-sm text-muted-foreground">Receive browser notifications in real-time</p>
            </div>
            <button
              onClick={() => setPushNotifications(!pushNotifications)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                pushNotifications ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  pushNotifications ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Security</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
            </div>
            <button
              onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                twoFactorEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  twoFactorEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <Button variant="outline" className="w-full">
            Change Password
          </Button>
        </div>
      </Card>

      {/* Account Actions */}
      <Card className="p-6 border-red-200 bg-red-50/50">
        <h2 className="text-xl font-bold text-red-700 mb-4">Danger Zone</h2>
        <div className="space-y-3">
          <Button variant="outline" className="w-full border-red-300 text-red-600 hover:bg-red-100">
            Export My Data
          </Button>
          <Button variant="outline" className="w-full border-red-300 text-red-600 hover:bg-red-100">
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Save Changes */}
      <div className="flex gap-3">
        <Button className="flex-1">Save Changes</Button>
        <Button variant="outline" className="flex-1">Cancel</Button>
      </div>
    </div>
  )
}
