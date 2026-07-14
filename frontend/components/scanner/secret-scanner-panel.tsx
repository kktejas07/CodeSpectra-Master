'use client'

import { useState } from 'react'
import { AlertTriangle, Key, Shield, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SecretFinding } from '@/lib/secret-scanner'
import { csrfFetch } from '@/lib/csrf-fetch'

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
}

const DEFAULT_CODE = `const AWS = require('aws-sdk');

// WARNING: This is a simulated secret for demo purposes
const config = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',  // Fake AWS key
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',  // Fake secret
};

const dbUrl = 'mongodb://admin:password123@cluster0.mongodb.net:27017/myapp';

const githubToken = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// Private key (truncated for demo)
const privateKey = \`-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----\`;
`.trim()

export function SecretScannerPanel() {
  const [code, setCode] = useState('')
  const [filename, setFilename] = useState('index.js')
  const [loading, setLoading] = useState(false)
  const [findings, setFindings] = useState<SecretFinding[]>([])
  const [stats, setStats] = useState<{ critical: number; high: number; medium: number; total: number } | null>(null)

  const runScan = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await csrfFetch('/api/scanner/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filename }),
      })
      const data = await res.json()
      if (data.findings) setFindings(data.findings)
      if (data.stats) setStats(data.stats)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadDemo = () => {
    setCode(DEFAULT_CODE)
    setFilename('config.js')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Secret Detection Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Detects hardcoded secrets, API keys, tokens, passwords, and private keys in source code.
            Covers AWS, GitHub, Slack, Google, Stripe, database credentials, and 30+ other patterns.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Filename (e.g., config.js)"
              className="flex-1 rounded-md border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
            <Button variant="outline" size="sm" onClick={loadDemo}>
              <Code2 className="h-3.5 w-3.5 mr-1" /> Load Demo
            </Button>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste source code to scan for secrets..."
            rows={12}
            className="w-full rounded-md border border-border/40 bg-background p-3 text-sm font-mono outline-none focus:border-primary/60 resize-y"
          />

          <Button onClick={runScan} disabled={loading || !code.trim()}>
            {loading ? 'Scanning...' : 'Scan for Secrets'}
          </Button>
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className={`h-5 w-5 ${stats.critical > 0 ? 'text-destructive' : 'text-green-500'}`} />
              Found {stats.total} Secret{stats.total !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-4">
              <Badge variant="outline" className={SEV_COLORS.critical}>Critical: {stats.critical}</Badge>
              <Badge variant="outline" className={SEV_COLORS.high}>High: {stats.high}</Badge>
              <Badge variant="outline" className={SEV_COLORS.medium}>Medium: {stats.medium}</Badge>
            </div>

            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className="rounded-lg border border-border/40 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SEV_COLORS[f.severity]}`}>
                        {f.severity}
                      </Badge>
                      <code className="text-xs font-medium">{f.secret_type}</code>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">Line {f.line}:{f.column}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{f.message}</p>
                  {f.context && (
                    <code className="block mt-1 text-xs text-muted-foreground/60 truncate">
                      {f.context}
                    </code>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.total === 0 && !loading && code.trim() && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No secrets detected in scanned code.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
