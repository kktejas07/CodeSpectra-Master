'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings, Save, RotateCcw, Bell, Lock, Code } from 'lucide-react'

interface ScannerConfig {
  autoScan: boolean
  scanOnPush: boolean
  emailNotifications: boolean
  minQualityThreshold: number
  maxBugsAllowed: number
  maxVulnerabilitiesAllowed: number
  failOnCritical: boolean
  customRules: boolean
}

interface ScannerConfigPanelProps {
  onSave?: (config: ScannerConfig) => void
}

export function ScannerConfigPanel({ onSave }: ScannerConfigPanelProps) {
  const [config, setConfig] = useState<ScannerConfig>({
    autoScan: false,
    scanOnPush: false,
    emailNotifications: true,
    minQualityThreshold: 70,
    maxBugsAllowed: 5,
    maxVulnerabilitiesAllowed: 0,
    failOnCritical: true,
    customRules: false,
  })

  const [hasChanges, setHasChanges] = useState(false)

  const updateConfig = (key: keyof ScannerConfig, value: boolean | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    onSave?.(config)
    setHasChanges(false)
  }

  const handleReset = () => {
    setConfig({
      autoScan: false,
      scanOnPush: false,
      emailNotifications: true,
      minQualityThreshold: 70,
      maxBugsAllowed: 5,
      maxVulnerabilitiesAllowed: 0,
      failOnCritical: true,
      customRules: false,
    })
    setHasChanges(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Scanner Configuration
          </h3>
          <p className="text-sm text-foreground/60">Customize code scanning behavior and thresholds</p>
        </div>
      </div>

      {/* Configuration Sections */}
      <div className="space-y-4">
        {/* Automation Settings */}
        <Card className="bg-card/30 border border-border p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Code className="w-5 h-5 text-primary" />
            <h4 className="font-semibold text-foreground">Automation</h4>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoScan}
                onChange={(e) => updateConfig('autoScan', e.target.checked)}
                className="w-4 h-4 rounded border border-border bg-background cursor-pointer"
              />
              <div>
                <p className="font-medium text-foreground text-sm">Auto Scan Enabled</p>
                <p className="text-xs text-foreground/60">Automatically scan code uploads</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.scanOnPush}
                onChange={(e) => updateConfig('scanOnPush', e.target.checked)}
                className="w-4 h-4 rounded border border-border bg-background cursor-pointer"
              />
              <div>
                <p className="font-medium text-foreground text-sm">Scan on Push</p>
                <p className="text-xs text-foreground/60">Scan GitHub repositories on every push</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.failOnCritical}
                onChange={(e) => updateConfig('failOnCritical', e.target.checked)}
                className="w-4 h-4 rounded border border-border bg-background cursor-pointer"
              />
              <div>
                <p className="font-medium text-foreground text-sm">Fail on Critical Issues</p>
                <p className="text-xs text-foreground/60">Block deployments if critical issues are found</p>
              </div>
            </label>
          </div>
        </Card>

        {/* Quality Thresholds */}
        <Card className="bg-card/30 border border-border p-6 space-y-4">
          <h4 className="font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Quality Thresholds
          </h4>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-3">
                Minimum Quality Score
                <span className="float-right font-bold text-primary">{config.minQualityThreshold}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={config.minQualityThreshold}
                onChange={(e) => updateConfig('minQualityThreshold', parseInt(e.target.value))}
                className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-xs text-foreground/60 mt-1">Code below this score will be flagged</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Max Bugs Allowed
                </label>
                <input
                  type="number"
                  min="0"
                  value={config.maxBugsAllowed}
                  onChange={(e) => updateConfig('maxBugsAllowed', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Max Vulnerabilities Allowed
                </label>
                <input
                  type="number"
                  min="0"
                  value={config.maxVulnerabilitiesAllowed}
                  onChange={(e) => updateConfig('maxVulnerabilitiesAllowed', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-foreground text-sm"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="bg-card/30 border border-border p-6 space-y-4">
          <h4 className="font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </h4>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.emailNotifications}
              onChange={(e) => updateConfig('emailNotifications', e.target.checked)}
              className="w-4 h-4 rounded border border-border bg-background cursor-pointer"
            />
            <div>
              <p className="font-medium text-foreground text-sm">Email Notifications</p>
              <p className="text-xs text-foreground/60">Get notified when critical issues are detected</p>
            </div>
          </label>

          <Badge className="w-fit bg-yellow-500/20 text-yellow-600 border border-yellow-500/30">
            Slack Integration Coming Soon
          </Badge>
        </Card>

        {/* Advanced Options */}
        <Card className="bg-card/30 border border-border p-6 space-y-4">
          <h4 className="font-semibold text-foreground border-b border-border pb-3 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Advanced Options
          </h4>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.customRules}
              onChange={(e) => updateConfig('customRules', e.target.checked)}
              className="w-4 h-4 rounded border border-border bg-background cursor-pointer"
            />
            <div>
              <p className="font-medium text-foreground text-sm">Custom Rules</p>
              <p className="text-xs text-foreground/60">Define custom linting and analysis rules</p>
            </div>
          </label>

          {config.customRules && (
            <div className="p-4 bg-background border border-border rounded">
              <label className="text-sm font-medium text-foreground block mb-2">Rule Configuration (JSON)</label>
              <textarea
                placeholder='{"rules": [{"name": "my-rule", "severity": "error"}]}'
                className="w-full h-24 p-2 bg-background border border-border rounded text-xs text-foreground font-mono placeholder-foreground/40 resize-none"
              />
            </div>
          )}
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-border sticky bottom-0 bg-background/80 backdrop-blur p-4 -m-6 mt-0">
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className="flex-1 gap-2"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!hasChanges}
          className="flex-1 gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
      </div>
    </div>
  )
}
