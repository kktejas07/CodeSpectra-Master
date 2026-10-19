'use client'

import { useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { GitPullRequest, AlertTriangle, FileCode, Users, Zap, ExternalLink, Loader } from 'lucide-react'
import { BlastRadiusAnalysis } from './blast-radius-analysis'
import type { D3Component, D3Dependency } from './d3-force-graph'

interface PRFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
}

interface PRDetails {
  number: number
  title: string
  state: string
  author: string
  base: string
  head: string
  files: PRFile[]
  totalChanges: number
}

interface PRImpactAnalysisProps {
  components: D3Component[]
  dependencies: D3Dependency[]
  githubToken?: string
}

function parsePRUrl(url: string): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) }
}

function matchFileToComponent(filename: string, components: D3Component[]): D3Component | null {
  const lower = filename.toLowerCase()
  return (
    components.find(c => {
      const cl = c.name.toLowerCase()
      return lower.includes(cl) || cl.includes(lower.split('/')[0].toLowerCase())
    }) || null
  )
}

export function PRImpactAnalysis({ components, dependencies, githubToken }: PRImpactAnalysisProps) {
  const [prUrl, setPrUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prDetails, setPrDetails] = useState<PRDetails | null>(null)
  const [selectedAffectedId, setSelectedAffectedId] = useState<string | null>(null)

  const fetchPR = useCallback(async () => {
    const parsed = parsePRUrl(prUrl)
    if (!parsed) {
      setError('Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123')
      return
    }
    setLoading(true)
    setError(null)
    setPrDetails(null)

    try {
      const headers: HeadersInit = {
        Accept: 'application/vnd.github.v3+json',
      }
      if (githubToken) headers.Authorization = `Bearer ${githubToken}`

      const [prRes, filesRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`, { headers }),
        fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}/files?per_page=100`, { headers }),
      ])

      if (!prRes.ok) {
        const err = await prRes.json().catch(() => ({}))
        throw new Error((err as { message?: string }).message || `GitHub API ${prRes.status}`)
      }
      if (!filesRes.ok) {
        const err = await filesRes.json().catch(() => ({}))
        throw new Error((err as { message?: string }).message || `GitHub API ${filesRes.status}`)
      }

      const prData = await prRes.json()
      const filesData = await filesRes.json() as PRFile[]

      setPrDetails({
        number: prData.number,
        title: prData.title,
        state: prData.state,
        author: prData.user?.login || 'unknown',
        base: prData.base?.ref || 'main',
        head: prData.head?.ref || 'feature',
        files: filesData,
        totalChanges: filesData.reduce((s, f) => s + f.changes, 0),
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch PR details')
    } finally {
      setLoading(false)
    }
  }, [prUrl, githubToken])

  const affectedComponents = prDetails
    ? prDetails.files
        .map(f => {
          const comp = matchFileToComponent(f.filename, components)
          return { file: f, component: comp }
        })
        .filter(r => r.component !== null)
    : []

  const affectedComponentIds = new Set(affectedComponents.map(r => r.component!.id))
  const unmatchedFiles = prDetails
    ? prDetails.files.filter(f => !matchFileToComponent(f.filename, components))
    : []

  const selectedComp = components.find(c => c.id === selectedAffectedId) || null

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl p-5 border-dashed">
        <div className="flex items-center gap-2 mb-4">
          <GitPullRequest className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">GitHub PR Impact Analysis</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Paste a GitHub pull request URL to see which architecture components it affects and its blast radius.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://github.com/owner/repo/pull/123"
            value={prUrl}
            onChange={e => setPrUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchPR()}
            className="flex-1 font-mono text-sm"
          />
          <Button onClick={fetchPR} disabled={loading || !prUrl.trim()}>
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Analyze'}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </p>
        )}
      </Card>

      {prDetails && (
        <>
          <Card className="rounded-3xl p-5 bg-linear-to-r from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">#{prDetails.number} {prDetails.title}</h3>
                  <Badge variant="outline" className={prDetails.state === 'open' ? 'border-green-500/30 text-green-700 dark:text-green-400' : 'border-foreground/30 text-muted-foreground'}>
                    {prDetails.state}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>by <span className="text-foreground">@{prDetails.author}</span></span>
                  <span>{prDetails.base} ← {prDetails.head}</span>
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Open on GitHub
                  </a>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{prDetails.files.length}</p>
                <p className="text-xs text-muted-foreground">Files changed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{prDetails.totalChanges}</p>
                <p className="text-xs text-muted-foreground">Total changes</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{affectedComponents.length}</p>
                <p className="text-xs text-muted-foreground">Components affected</p>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileCode className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Changed files ({prDetails.files.length})</h4>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {prDetails.files.map(f => {
                  const matched = matchFileToComponent(f.filename, components)
                  return (
                    <div key={f.filename} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${
                          f.status === 'added' ? 'border-green-500/30 text-green-700 dark:text-green-400' :
                          f.status === 'deleted' ? 'border-red-500/30 text-red-700 dark:text-red-400' :
                          'border-border'
                        }`}
                      >
                        {f.status}
                      </Badge>
                      <code className="text-xs text-foreground flex-1 truncate font-mono" title={f.filename}>
                        {f.filename}
                      </code>
                      {matched ? (
                        <button
                          className="text-xs text-primary hover:underline shrink-0"
                          onClick={() => setSelectedAffectedId(matched.id)}
                        >
                          → {matched.name}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">no match</span>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">+{f.additions} -{f.deletions}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Architecture impact</h4>
              </div>
              {affectedComponents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No matching architecture components for changed files.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {affectedComponents.filter((r): r is { file: PRFile; component: D3Component } => r.component !== null).map(({ file, component }) => (
                    <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                      key={file.filename}
                      className={`flex items-start gap-2 py-2 border-b border-border/30 last:border-0 cursor-pointer hover:bg-primary/5 rounded px-2 -mx-2 ${
                        selectedAffectedId === component.id ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedAffectedId(
                        selectedAffectedId === component.id ? null : component.id
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{component.name}</p>
                        <code className="text-xs text-muted-foreground truncate block">{file.filename}</code>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          component.health === 'critical' ? 'border-red-500/30 text-red-700 dark:text-red-400' :
                          component.health === 'warning' ? 'border-yellow-500/30 text-amber-700 dark:text-amber-400' :
                          'border-green-500/30 text-green-700 dark:text-green-400'
                        }
                      >
                        {component.health}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {affectedComponentIds.size > 0 && selectedAffectedId && (
            <BlastRadiusAnalysis
              components={components}
              dependencies={dependencies}
              selectedId={selectedAffectedId}
            />
          )}

          {unmatchedFiles.length > 0 && (
            <Card className="p-4 bg-orange-500/5 border-orange-500/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                  Unmatched files ({unmatchedFiles.length}) — no matching architecture component
                </h4>
              </div>
              <div className="space-y-1">
                {unmatchedFiles.slice(0, 10).map(f => (
                  <code key={f.filename} className="block text-xs font-mono text-muted-foreground truncate">
                    {f.filename}
                  </code>
                ))}
                {unmatchedFiles.length > 10 && (
                  <p className="text-xs text-muted-foreground">…and {unmatchedFiles.length - 10} more</p>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}