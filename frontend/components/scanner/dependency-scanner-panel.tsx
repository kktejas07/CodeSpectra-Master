'use client'

import { useState } from 'react'
import { AlertTriangle, Package, Shield, ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DepIssue } from '@/lib/dependency-scanner'
import { csrfFetch } from '@/lib/csrf-fetch'
import { EmptyState } from '@/components/ui/empty-state'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
  const [files, setFiles] = useState<{ path: string; content: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<DepIssue[]>([])
  const [manifests, setManifests] = useState<string[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const addDemoFile = (f: typeof DEMO_FILES[0]) => {
    setFiles((prev) => [...prev.filter((x) => x.path !== f.path), f])
  }

  const runScan = async () => {
    if (files.length === 0) return
    setLoading(true)
    setScanError(null)
    setScanned(false)
    try {
      const res = await csrfFetch('/api/scanner/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : t('tools.theDependencyScanFailed'))
      }
      setIssues(Array.isArray(data.issues) ? data.issues : [])
      setManifests(Array.isArray(data.manifestsScanned) ? data.manifestsScanned : [])
      setScanned(true)
    } catch (e) {
      console.error(e)
      setIssues([])
      setManifests([])
      setScanError(e instanceof Error ? e.message : t('tools.theDependencyScanFailed'))
    } finally {
      setLoading(false)
    }
  }

  const [showAddModal, setShowAddModal] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [newFileContent, setNewFileContent] = useState('')

  const handleAddSubmit = () => {
    if (!newFilePath.trim()) return
    setFiles((prev) => [...prev.filter((x) => x.path !== newFilePath), { path: newFilePath, content: newFileContent }])
    setShowAddModal(false)
    setNewFilePath('')
    setNewFileContent('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />{t('tools.dependencyVulnerabilityScanner')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('tools.scansManifestFilesPackageJsonRequirement6cc')}</p>

          {/* File list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('tools.manifestFilesCount', { count: files.length })}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1" />{' '}{t('tools.addFile')}</Button>
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
                <button onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))} className="text-muted-foreground hover:text-destructive text-xs">{t('tools.remove')}</button>
              </div>
            ))}
          </div>

          <Button onClick={runScan} disabled={loading || files.length === 0}>
            {loading ? t('tools.scanningDependencies') : t('tools.scanForVulnerabilities')}
          </Button>
          {scanned && !scanError && issues.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">{t('tools.noKnownVulnerabilitiesInTheScanned46d')}</p>
          ) : null}
        </CardContent>
      </Card>

      {scanError ? (
        <EmptyState
          compact
          illustration="error"
          title={t('tools.couldntScanDependencies')}
          description={scanError}
          actionLabel={t('common.tryAgain')}
          onAction={() => void runScan()}
        />
      ) : null}

      {manifests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('tools.manifestsScanned')}</CardTitle>
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
              <Shield className="h-5 w-5 text-destructive" />{t('tools.countVulnerabilityiesFound', { count: issues.length })}</CardTitle>
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
                    <span>{t('tools.ecosystemEcosystem', { ecosystem: issue.ecosystem })}</span>
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
                      <span className="text-green-500">{t('tools.fixVFixedVersion', { fixed_version: issue.fixed_version })}</span>
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
            <p className="text-sm text-muted-foreground">{t('tools.noKnownVulnerabilitiesFoundInScanned87b')}</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tools.addManifestFile')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="filePath">{t('tools.filePathEGPackageJson')}</Label>
              <Input
                id="filePath"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="package.json"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fileContent">{t('tools.fileContent')}</Label>
              <Textarea
                id="fileContent"
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder={t('tools.nDependenciesNLodash417520')}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleAddSubmit} disabled={!newFilePath.trim()}>{t('tools.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
