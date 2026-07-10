'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { Smartphone, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function MobileSettingsPage() {
  const gate = usePageGuard('superadmin')
  const url = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const [copied, setCopied] = useState(false)
  const qrSrc = url ? `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodeURIComponent(url)}` : ''

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }

  if (!gate.ready) return null

  return (
    <div className="mx-auto max-w-lg space-y-8 px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card"><Smartphone className="h-5 w-5 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Mobile App</h1><p className="text-sm text-muted-foreground">Connect the Expo app to this server</p></div>
      </div>

      <Card className="p-8 border-border/60 flex flex-col items-center space-y-6">
        {qrSrc ? (
          <img src={qrSrc} alt="QR Code" className="rounded-2xl border-4 border-white shadow-sm" width={250} height={250} />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            No URL configured
          </div>
        )}
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Scan with your mobile device</p>
          <p className="text-xs text-muted-foreground">Open the Codespectra app → Configure Server → paste the URL or scan this QR code</p>
        </div>
      </Card>

      <Card className="p-5 border-border/60 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Server URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-mono truncate">{url}</code>
          <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Card>

      <Card className="p-5 border-dashed border-muted-foreground/30 space-y-2">
        <h3 className="text-sm font-medium">Manual setup</h3>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Install the Codespectra APK on your Android device</li>
          <li>Open the app → tap &quot;Configure server&quot;</li>
          <li>Paste the server URL or manually type it</li>
          <li>Sign in with your credentials</li>
        </ol>
      </Card>
    </div>
  )
}
