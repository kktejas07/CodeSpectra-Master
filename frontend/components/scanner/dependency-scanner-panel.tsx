'use client'

import { useState } from 'react'
import { AlertTriangle, Package, Shield, ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { DepIssue } from '@/lib/dependency-scanner'
import { csrfFetch } from '@/lib/csrf-fetch'

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

const DEMO_FILES = [
  { path: 'package.json', content: JSON.stringify({
    name: 'demo-project',
    dependencies: { lodash: '^4.17.19', axios: '^0.19.0', express: '^4.16.0' },
    devDependencies: { minimist: '^1.2.0' },
  }, null, 2) },
  { path: 'requirements.txt', content: 'Django==3.2.15\nrequests==2.28.0\nFlask==2.1.0' },
]

export function DependencyScannerPanel() {
  const [files, setFiles] = useState<{ path: string; content: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<DepIssue[]>([])
  const [manifests, setManifests] = useState<string[]>([])

  const addDemoFile = (f: typeof DEMO_FILES[0]) => {
    setFiles((prev) => [...prev.filter((x) => x.path !== f.path), f])
  }

  const runScan = async () => {
    if (files.length === 0) return
    setLoading(true)
    try {
      const res = await csrfFetch('/api/scanner/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      const data = await res.json()
      if (data.issues) setIssues(data.issues)
      if (data.manifestsScanned) setManifests(data.manifestsScanned)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const addFile = () => {
    const path = window.prompt('File path (e.g., package.json):')
    if (!path) return
    const content = window.prompt('File content:')
    if (content === null) return
    setFiles((prev) => [...prev.filter((x) => x.path !== path), { path, content }])
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Dependency Vulnerability Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Scans manifest files (package.json, requirements.txt, go.mod, pom.xml, Cargo.toml, Gemfile, build.gradle, composer.json)
            against the OSV.dev vulnerability database and embedded advisories.
          </p>

          {/* File list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Manifest Files ({files.length})</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addFile}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> Add File
                </Button>
                {DEMO_FILES.map((f) => (
                  <Button key={f.path} variant="outline" size="sm" onClick={() => addDemoFile(f)}>
                    +{f.path}
                  </Button>
                ))}
              </div>
            </div>
            {files.map((f) => (
              <div key={f.path} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 text-sm">
                <code className="text-xs">{f.path}</code>
                <button onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))} className="text-muted-foreground hover:text-destructive text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>

          <Button onClick={runScan} disabled={loading || files.length === 0}>
            {loading ? 'Scanning dependencies...' : 'Scan for Vulnerabilities'}
          </Button>
        </CardContent>
      </Card>

      {manifests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Manifests Scanned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {manifests.map((m) => (
                <Badge key={m} variant="outline">{m}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              {issues.length} Vulnerability{issues.length !== 1 ? 'ies' : 'y'} Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {issues.map((issue, i) => (
                <div key={i} className="rounded-lg border border-border/40 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <code className="text-sm font-medium">{issue.package_name}</code>
                      <span className="text-xs text-muted-foreground ml-2">v{issue.current_version}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEV_COLORS[issue.severity] || SEV_COLORS.medium}`}>
                        {issue.severity}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{issue.summary}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Ecosystem: {issue.ecosystem}</span>
                    {issue.cve_id && (
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${issue.cve_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        {issue.cve_id} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {issue.fixed_version && (
                      <span className="text-green-500">Fix: v{issue.fixed_version}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {issues.length === 0 && files.length > 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No known vulnerabilities found in scanned dependencies.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
