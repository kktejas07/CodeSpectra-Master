'use client'

import { useMemo, useState, Suspense, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Code2, Sparkles, Loader, Github, Plus, BarChart3, Settings, FileText, Users, Shield, Activity, GitBranch, GitPullRequest, Zap, HelpCircle } from 'lucide-react'
import { parseScannerMode } from '@/lib/scanner-modes'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Card } from '@/components/ui/card'
import { AdvancedMetrics } from '@/components/scanner/advanced-metrics'
import { SuggestedFixes } from '@/components/scanner/suggested-fixes'
import { GitHubIntegration } from '@/components/scanner/github-integration'
import { RepositoryBrowser } from '@/components/scanner/repository-browser'
import { ScanHistory } from '@/components/scanner/scan-history'
import { MetricsTrendChart } from '@/components/scanner/metrics-trend-chart'
import { CodeDiffViewer } from '@/components/scanner/code-diff-viewer'
import { QualityGatesLivePanel } from '@/components/scanner/quality-gates-live-panel'
import { CodeReviewPanel } from '@/components/scanner/code-review-panel'
import { ScannerConfigPanel } from '@/components/scanner/scanner-config-panel'
import { ReportGenerator } from '@/components/scanner/report-generator'
import { InsightsDashboard } from '@/components/scanner/insights-dashboard'
import { TeamLeaderboard } from '@/components/scanner/team-leaderboard'
import { MetricsFileBrowser } from '@/components/scanner/metrics-file-browser'
import { SecurityHotspots } from '@/components/scanner/security-hotspots'
import { QualityRatings } from '@/components/scanner/quality-ratings'
import { ActivityTimeline } from '@/components/scanner/activity-timeline'
import { ArchitectureVisualization } from '@/components/scanner/architecture-visualization'
import { PRIntegration } from '@/components/scanner/pr-integration'
import { BranchAnalytics } from '@/components/scanner/branch-analytics'
import { AIFixesPanel } from '@/components/scanner/ai-fixes-panel'
import { CodeEditor } from '@/components/code-scanner/code-editor'

interface AnalysisResult {
  id: string
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  securityHotspots: number
  duplicatePercentage: number
  complexityScore: number
  maintainabilityIndex: number
  testCoveragePercentage: number
  performance: string
  bestPractices: string[]
  issues: Array<{
    type: 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot' | 'duplicate'
    severity: 'critical' | 'major' | 'minor' | 'info'
    rule: string
    message: string
    line?: number
    effortMinutes?: number
  }>
  suggestions: string[]
  timeMs: number
  timestamp: Date
  scanId?: string
  /** Language label for scan history (from server or current picker). */
  language?: string
}

function CodeScannerPageInner() {
  const searchParams = useSearchParams()
  const mode = useMemo(
    () => parseScannerMode(searchParams.get('mode')),
    [searchParams]
  )
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [scanHistory, setScanHistory] = useState<AnalysisResult[]>([])
  const [githubScanBusy, setGithubScanBusy] = useState(false)
  const [githubScanCode, setGithubScanCode] = useState('')
  const [useMonacoEditor, setUseMonacoEditor] = useState(false)
  const [aiFixBusy, setAiFixBusy] = useState(false)
  const [aiFixError, setAiFixError] = useState<string | null>(null)
  const [aiGeneratedFixes, setAiGeneratedFixes] = useState<Array<Record<string, unknown>> | null>(null)
  const [aiFixDegraded, setAiFixDegraded] = useState(false)
  const [appliedDbFixIds, setAppliedDbFixIds] = useState<Set<string>>(() => new Set())
  const [runtimes, setRuntimes] = useState<Array<{language:string, version:string, aliases:string[]}>>([])
  const [runtimesLoading, setRuntimesLoading] = useState(true)

  useEffect(() => {
    if (mode !== 'manual') return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/runtimes', { credentials: 'include' })
        const data = await res.json()
        if (!cancelled && Array.isArray(data.runtimes)) {
          const popularIds = new Set([
            'bash','c','c++','csharp','clojure','dart','elixir','erlang','go',
            'fortran','groovy','haskell','java','javascript','julia','kotlin',
            'lua','nim','ocaml','perl','php','python','rscript','racket','ruby',
            'rust','scala','sqlite3','swift','typescript','zig',
            'csharp.net','dotnet','fsharp.net','basic.net','deno','mono',
            'coffeescript','crystal','d','lisp','octave','pascal','powershell',
            'prolog','pure','raku','smalltalk','vlang',
          ])
          const filtered = data.runtimes.filter((r: any) => popularIds.has(r.language))
          setRuntimes(filtered.length > 0 ? filtered : data.runtimes)
          setRuntimesLoading(false)
        }
      } catch {
        if (!cancelled) setRuntimesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [mode])

  useEffect(() => {
    if (mode !== 'manual' && mode !== 'github') return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/analysis-history?limit=20', { credentials: 'include' })
        const json = await response.json()
        if (cancelled || !response.ok || !json.success || !Array.isArray(json.scans)) return
        const mapped: AnalysisResult[] = json.scans.map((row: Record<string, unknown>) => ({
          ...(row as Omit<AnalysisResult, 'timestamp' | 'scanId'>),
          timestamp: new Date(row.timestamp as string),
          language: typeof row.language === 'string' ? row.language : undefined,
        }))
        if (mapped.length > 0) {
          setScanHistory(mapped)
        }
      } catch {
        /* offline or unauthenticated */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'github') setGithubScanCode('')
  }, [mode])

  const handleGitHubScanResult = useCallback((result: Record<string, unknown>) => {
    if (result && typeof result === 'object' && 'error' in result) return
    const scanned =
      typeof (result as { scanned_code?: unknown }).scanned_code === 'string'
        ? (result as { scanned_code: string }).scanned_code
        : ''
    setGithubScanCode(scanned)
    const { scanId, scannerLanguage, scanned_code: _sc, ...rest } = result as AnalysisResult & {
      scanId?: string
      scannerLanguage?: string
      scanned_code?: string
    }
    const analysisWithMetadata: AnalysisResult = {
      ...(rest as Omit<AnalysisResult, 'id' | 'timestamp' | 'scanId' | 'language'>),
      id: typeof scanId === 'string' && scanId.length > 0 ? scanId : `scan-${Date.now()}`,
      timestamp: new Date(),
      language: typeof scannerLanguage === 'string' ? scannerLanguage : 'javascript',
    }
    setAnalysis(analysisWithMetadata)
    setScanHistory((prev) =>
      [analysisWithMetadata, ...prev.filter((h) => h.id !== analysisWithMetadata.id)].slice(0, 25)
    )
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) return

    setLoading(true)
    try {
      const response = await fetch('/api/analyze-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })

      const result = await response.json()
      if (!response.ok) {
        console.error('[CodeSpectra] Analysis error:', result)
        return
      }
      const { scanId, scannerLanguage, ...rest } = result as AnalysisResult & {
        scanId?: string
        scannerLanguage?: string
      }
      const analysisWithMetadata: AnalysisResult = {
        ...(rest as Omit<AnalysisResult, 'id' | 'timestamp' | 'scanId' | 'language'>),
        id: typeof scanId === 'string' && scanId.length > 0 ? scanId : `scan-${Date.now()}`,
        timestamp: new Date(),
        language: scannerLanguage ?? language,
      }
      setAnalysis(analysisWithMetadata)
      setScanHistory((prev) =>
        [analysisWithMetadata, ...prev.filter((h) => h.id !== analysisWithMetadata.id)].slice(0, 25)
      )
    } catch (error) {
      console.error('[CodeSpectra] Analysis failed:', error)
    } finally {
      setLoading(false)
    }
  }, [code, language])

  const clearAnalysis = () => {
    setCode('')
    setAnalysis(null)
  }

  return (
    <div className="space-y-6">
      {/* Manual Analysis Mode */}
      {mode === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <Card className="bg-card border border-border p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Programming Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  {runtimesLoading ? (
                    <option value="">Loading languages...</option>
                  ) : runtimes.length > 0 ? (
                    runtimes.map((rt) => (
                      <option key={rt.language || rt.version} value={rt.language}>
                        {(rt.language || '').charAt(0).toUpperCase() + (rt.language || '').slice(1)}
                      </option>
                    ))
                  ) : (
                    <option value="">No runtimes loaded</option>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">Paste Your Code</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setUseMonacoEditor((v) => !v)}
                  >
                    {useMonacoEditor ? 'Plain textarea' : 'Monaco editor'}
                  </Button>
                </div>
                {useMonacoEditor ? (
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={language}
                    height={360}
                    liveAnalysis={false}
                    theme="vs-dark"
                    diagnostics={[]}
                  />
                ) : (
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Paste your code here for analysis..."
                    className="h-96 w-full resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                <p className="text-xs text-foreground/50">
                  Monaco mode (Phase 5): syntax highlighting and layout; use <strong>Scan Code</strong> to persist a
                  scan when signed in.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={loading || !code.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Scan Code
                    </>
                  )}
                </Button>
                {analysis && (
                  <Button variant="outline" onClick={clearAnalysis}>
                    Clear
                  </Button>
                )}
              </div>

              {analysis && (
                <div className="pt-4 border-t border-border text-xs text-foreground/50">
                  Analysis completed in {analysis.timeMs}ms
                </div>
              )}
            </Card>

            {/* Scan History */}
            {scanHistory.length > 0 && (
              <ScanHistory
                scans={scanHistory.map((scan) => ({
                  id: scan.id,
                  source: 'manual',
                  target: scan.language ?? language,
                  language: scan.language ?? language,
                  quality: scan.quality,
                  bugs: scan.bugs,
                  vulnerabilities: scan.vulnerabilities,
                  codeSmells: scan.codeSmells,
                  timestamp: scan.timestamp,
                  duration: scan.timeMs,
                }))}
                onSelectScan={(scan) => {
                  const historyItem = scanHistory.find((h) => h.id === scan.id)
                  if (historyItem) setAnalysis(historyItem)
                }}
              />
            )}
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            {!analysis ? (
              <Card className="h-full flex items-center justify-center bg-card/30 border border-border">
                <div className="text-center p-6">
                  <Code2 className="w-12 h-12 text-foreground/40 mx-auto mb-3" />
                  <p className="text-foreground/60">
                    Paste your code and click <strong>Scan Code</strong> to see detailed analysis
                  </p>
                  <p className="text-xs text-foreground/50 mt-2">
                    Supports: {runtimesLoading ? 'Loading...' : runtimes.length > 0 ? runtimes.map(rt => rt.language).join(', ') : 'Popular languages (auto-detected from engine)'}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Advanced Metrics */}
                <AdvancedMetrics
                  quality={analysis.quality}
                  bugs={analysis.bugs}
                  vulnerabilities={analysis.vulnerabilities}
                  codeSmells={analysis.codeSmells}
                  securityHotspots={analysis.securityHotspots}
                  duplicatePercentage={analysis.duplicatePercentage}
                  complexityScore={analysis.complexityScore}
                  maintainabilityIndex={analysis.maintainabilityIndex}
                  testCoveragePercentage={analysis.testCoveragePercentage}
                />

                {/* Suggested Fixes */}
                {analysis.issues.length > 0 && (
                  <div className="pt-4">
                    <SuggestedFixes issues={analysis.issues} />
                    <AIFixesPanel sourceCode={code} analysis={analysis} languageFallback={language} />
                  </div>
                )}

                {/* Performance Notes */}
                {analysis.performance && (
                  <Card className="bg-card/30 border border-border p-4">
                    <h4 className="font-semibold text-foreground mb-2">Performance Analysis</h4>
                    <p className="text-sm text-foreground/70">{analysis.performance}</p>
                  </Card>
                )}

                {/* Best Practices */}
                {analysis.bestPractices.length > 0 && (
                  <Card className="bg-green-500/10 border border-green-500/30 p-4">
                    <h4 className="font-semibold text-green-400 mb-3">What You Did Well</h4>
                    <ul className="space-y-2">
                      {analysis.bestPractices.map((practice, i) => (
                        <li key={i} className="text-sm text-green-300 flex gap-2">
                          <span className="text-green-400">✓</span>
                          {practice}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Suggestions */}
                {analysis.suggestions.length > 0 && (
                  <Card className="bg-blue-500/10 border border-blue-500/30 p-4">
                    <h4 className="font-semibold text-blue-400 mb-3">Recommendations</h4>
                    <ul className="space-y-2">
                      {analysis.suggestions.map((suggestion, i) => (
                        <li key={i} className="text-sm text-blue-300 flex gap-2">
                          <span className="text-blue-400">→</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GitHub Integration Mode */}
      {mode === 'github' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <GitHubIntegration />
            <RepositoryBrowser
              onGitHubScanResult={handleGitHubScanResult}
              scanBusy={githubScanBusy}
              onScanBusyChange={setGithubScanBusy}
            />

            <Card className="border border-border bg-card/30 p-6">
              <h3 className="mb-4 font-semibold text-foreground">GitHub roadmap</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Plus className="h-4 w-4" />
                    Webhooks
                  </h4>
                  <p className="text-sm text-foreground/60">
                    Point repo webhooks to <code className="rounded bg-muted px-1 text-xs">/api/github/webhook</code>{' '}
                    with <code className="rounded bg-muted px-1 text-xs">GITHUB_WEBHOOK_SECRET</code> — deliveries are
                    logged for audit.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Plus className="h-4 w-4" />
                    Token encryption
                  </h4>
                  <p className="text-sm text-foreground/60">
                    Set <code className="rounded bg-muted px-1 text-xs">GITHUB_TOKEN_ENCRYPTION_KEY</code> (base64, 32
                    bytes) so new OAuth tokens are stored encrypted at rest.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            {!analysis ? (
              <Card className="flex min-h-[280px] items-center justify-center border border-border bg-card/30 p-6">
                <div className="text-center text-muted-foreground">
                  <Code2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm">Select a repository, then click a file to scan and persist results.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                <AdvancedMetrics
                  quality={analysis.quality}
                  bugs={analysis.bugs}
                  vulnerabilities={analysis.vulnerabilities}
                  codeSmells={analysis.codeSmells}
                  securityHotspots={analysis.securityHotspots}
                  duplicatePercentage={analysis.duplicatePercentage}
                  complexityScore={analysis.complexityScore}
                  maintainabilityIndex={analysis.maintainabilityIndex}
                  testCoveragePercentage={analysis.testCoveragePercentage}
                />
                {analysis.issues.length > 0 && (
                  <div className="pt-2">
                    <SuggestedFixes issues={analysis.issues} />
                    <AIFixesPanel
                      sourceCode={githubScanCode}
                      analysis={analysis}
                      languageFallback={analysis.language ?? 'javascript'}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metrics Trend Mode */}
      {mode === 'trends' && (
        <div className="space-y-6">
          <Card className="bg-card/30 border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">Code Quality Trends</h3>
            <p className="text-sm text-foreground/60 mb-6">
              Track how your code quality metrics evolve over time. Historical data helps you identify patterns and improvements.
            </p>
          </Card>
          <MetricsTrendChart
            data={[
              { date: '2024-01-01', quality: 72, bugs: 8, vulnerabilities: 2, codeSmells: 15, complexity: 45, coverage: 65 },
              { date: '2024-01-08', quality: 75, bugs: 6, vulnerabilities: 2, codeSmells: 12, complexity: 42, coverage: 68 },
              { date: '2024-01-15', quality: 78, bugs: 4, vulnerabilities: 1, codeSmells: 10, complexity: 40, coverage: 72 },
              { date: '2024-01-22', quality: 82, bugs: 2, vulnerabilities: 1, codeSmells: 7, complexity: 38, coverage: 76 },
              { date: '2024-01-29', quality: 85, bugs: 1, vulnerabilities: 0, codeSmells: 5, complexity: 36, coverage: 81 },
            ]}
            metric="quality"
          />
        </div>
      )}

      {/* Quality Gates Mode */}
      {mode === 'quality-gates' && <QualityGatesLivePanel />}

      {/* Code Review Mode */}
      {mode === 'review' && (
        <CodeReviewPanel
          issueId="issue-1"
          comments={[]}
          onAddComment={(text) => console.log('Added comment:', text)}
          onReply={(commentId, text) => console.log('Replied to', commentId, ':', text)}
          onResolve={(issueId) => console.log('Resolved:', issueId)}
        />
      )}

      {/* Configuration Mode */}
      {mode === 'config' && (
        <ScannerConfigPanel
          onSave={(config) => console.log('Config saved:', config)}
        />
      )}

      {/* Reports Mode */}
      {mode === 'reports' && (
        <ReportGenerator
          onExport={(format) => console.log('Exporting as:', format)}
          onEmail={(recipients) => console.log('Emailing to:', recipients)}
          onShare={(link) => console.log('Share link:', link)}
        />
      )}

      {/* Insights Mode */}
      {mode === 'insights' && (
        <InsightsDashboard />
      )}

      {/* Metrics Browser Mode */}
      {mode === 'metrics' && (
        <MetricsFileBrowser />
      )}

      {/* Security Hotspots Mode */}
      {mode === 'hotspots' && (
        <SecurityHotspots />
      )}

      {/* Quality Ratings Mode */}
      {mode === 'ratings' && (
        <QualityRatings />
      )}

      {/* Activity Timeline Mode */}
      {mode === 'activity' && (
        <ActivityTimeline />
      )}

      {/* Architecture Visualization Mode */}
      {mode === 'architecture' && (
        <ArchitectureVisualization />
      )}

      {/* PR Integration Mode */}
      {mode === 'pr' && (
        <PRIntegration />
      )}

      {/* Branch Analytics Mode */}
      {mode === 'branches' && (
        <BranchAnalytics />
      )}

      {/* Team Mode */}
      {mode === 'team' && (
        <TeamLeaderboard />
      )}

      {/* Feature Overview */}
      {mode === 'manual' && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <HelpCircle className="h-4 w-4 mr-1" /> Scanner tools
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[300px] p-3">
              <div className="grid gap-1.5 text-xs">
                <p><strong>Manual Analysis:</strong> Scan code directly</p>
                <p><strong>GitHub:</strong> Connect and scan repos</p>
                <p><strong>Trends:</strong> Track quality over time</p>
                <p><strong>Quality Gates:</strong> Set quality standards</p>
                <p><strong>Code Review:</strong> Collaborative reviews</p>
                <p><strong>Configuration:</strong> Customize rules</p>
                <p><strong>Reports:</strong> Export results</p>
                <p><strong>Insights:</strong> Dashboard analytics</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

export default function CodeScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Loading scanner…</div>
      }
    >
      <CodeScannerPageInner />
    </Suspense>
  )
}
