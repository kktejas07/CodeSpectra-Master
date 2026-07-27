'use client'

import { useMemo, useState, Suspense, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { Code2, Sparkles, Loader, Github, Plus, BarChart3, Settings, FileText, Users, Shield, Activity, GitBranch, GitPullRequest, Zap, HelpCircle, AlertTriangle, Info, Lock, Play, Loader2 } from 'lucide-react'
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
import { csrfFetch } from '@/lib/csrf-fetch'
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
import { CodebaseChatSidebar } from '@/components/scanner/codebase-chat-sidebar'
import { DependencyScannerPanel } from '@/components/scanner/dependency-scanner-panel'
import { SecretScannerPanel } from '@/components/scanner/secret-scanner-panel'
import { PatternDetector } from '@/components/scanner/pattern-detector'
import { PRImpactAnalysis } from '@/components/scanner/pr-impact-analysis'
import { detectLanguage } from '@/lib/local-code-analyzer'
import { usePageGuard } from '@/lib/use-page-guard'

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
  /** Code snippet analyzed (for loading back into editor). */
  codeSnippet?: string
}

function CodeScannerPageInner() {
  const searchParams = useSearchParams()
  const mode = useMemo(
    () => parseScannerMode(searchParams.get('mode')),
    [searchParams]
  )

  // Handle GitHub OAuth callback — auto-refresh when coming back from GitHub auth
  useEffect(() => {
    const githubParam = searchParams.get('github')
    if (githubParam === 'connected') {
      const login = searchParams.get('login')
      // Clean URL params without page reload
      const url = new URL(window.location.href)
      url.searchParams.delete('github')
      url.searchParams.delete('login')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [detectedLang, setDetectedLang] = useState<string | null>(null)

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode)
    if (newCode.trim().length > 10) {
      const detected = detectLanguage(newCode)
      if (detected && detected !== 'plaintext') {
        setDetectedLang(detected)
      }
    }
  }, [])

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
  const [runtimeMap, setRuntimeMap] = useState<Record<string,string>>({})
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState<{
    stdout: string
    stderr: string
    code: number | null
    compileOutput?: string
  } | null>(null)
  const [scanPage, setScanPage] = useState(1)
  const [scansTotalCount, setScansTotalCount] = useState(0)
  const SCANS_PER_PAGE = 5
  const { lockedFeatures } = useLockedFeatures()
  const isModeLocked = (m: string) => lockedFeatures.includes(`scanner:${m}`)

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
          const list = filtered.length > 0 ? filtered : data.runtimes
          setRuntimes(list)
          const map: Record<string,string> = {}
          for (const r of list) {
            map[r.language.toLowerCase()] = r.language
            for (const a of r.aliases || []) map[a.toLowerCase()] = r.language
          }
          setRuntimeMap(map)
          setRuntimesLoading(false)
        }
      } catch {
        if (!cancelled) setRuntimesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [mode])

  const fetchScanHistory = useCallback(async (page: number) => {
    const offset = (page - 1) * SCANS_PER_PAGE
    try {
      const response = await fetch(`/api/analysis-history?limit=${SCANS_PER_PAGE}&offset=${offset}`, { credentials: 'include' })
      const json = await response.json()
      if (!response.ok || !json.success || !Array.isArray(json.scans)) return
      const mapped: AnalysisResult[] = json.scans.map((row: Record<string, unknown>) => ({
        ...(row as Omit<AnalysisResult, 'timestamp' | 'scanId'>),
        timestamp: new Date(row.timestamp as string),
        language: typeof row.language === 'string' ? row.language : undefined,
      }))
      setScanHistory(mapped)
      if (typeof json.count === 'number') setScansTotalCount(json.count)
    } catch {
      /* offline or unauthenticated */
    }
  }, [])

  useEffect(() => {
    if (mode !== 'manual' && mode !== 'github') return
    setScanPage(1)
    fetchScanHistory(1)
  }, [mode, fetchScanHistory])

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
    const { scanId, scannerLanguage, scanned_code: _sc, ...rest } = result as unknown as AnalysisResult & {
      scanId?: string
      scannerLanguage?: string
      scanned_code?: string
    }
    const analysisWithMetadata: AnalysisResult = {
      ...(rest as Omit<AnalysisResult, 'id' | 'timestamp' | 'scanId' | 'language'>),
      id: typeof scanId === 'string' && scanId.length > 0 ? scanId : `scan-${Date.now()}`,
      timestamp: new Date(),
      language: typeof scannerLanguage === 'string' ? scannerLanguage : 'javascript',
      codeSnippet: typeof _sc === 'string' && _sc ? _sc : typeof (rest as unknown as { codeSnippet?: string }).codeSnippet === 'string' ? (rest as unknown as { codeSnippet?: string }).codeSnippet : '',
    }
    setAnalysis(analysisWithMetadata)
    setScanPage(1)
    fetchScanHistory(1)
  }, [fetchScanHistory])

  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) return

    setLoading(true)
    try {
      const response = await csrfFetch('/api/analyze-code', {
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
      const { scanId, scannerLanguage, ...rest } = result as unknown as AnalysisResult & {
        scanId?: string
        scannerLanguage?: string
      }
      const analysisWithMetadata: AnalysisResult = {
        ...(rest as Omit<AnalysisResult, 'id' | 'timestamp' | 'scanId' | 'language'>),
        id: typeof scanId === 'string' && scanId.length > 0 ? scanId : `scan-${Date.now()}`,
        timestamp: new Date(),
        language: scannerLanguage ?? language,
        codeSnippet: typeof (rest as unknown as { codeSnippet?: string }).codeSnippet === 'string' ? (rest as unknown as { codeSnippet?: string }).codeSnippet : code,
      }
      setAnalysis(analysisWithMetadata)
      setScanPage(1)
      fetchScanHistory(1)
    } catch (error) {
      console.error('[CodeSpectra] Analysis failed:', error)
    } finally {
      setLoading(false)
    }
  }, [code, language])

  const handleRunCode = useCallback(async () => {
    if (!code.trim()) return
    setExecuting(true)
    setExecResult(null)
    try {
      const res = await csrfFetch('/api/execute-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, source: code }),
      })
      const data = await res.json()
      if (data.success && data.result) {
        setExecResult({
          stdout: data.result.run?.stdout ?? '',
          stderr: data.result.run?.stderr ?? '',
          code: data.result.run?.code ?? null,
          compileOutput: data.result.compile?.output,
        })
      } else {
        setExecResult({
          stdout: '',
          stderr: data.error || 'Execution failed',
          code: 1,
        })
      }
    } catch (err: any) {
      setExecResult({
        stdout: '',
        stderr: err?.message || 'Execution request failed',
        code: 1,
      })
    } finally {
      setExecuting(false)
    }
  }, [code, language])

  const clearAnalysis = () => {
    setCode('')
    setAnalysis(null)
    setExecResult(null)
    setDetectedLang(null)
  }

  return (
    <div className="space-y-6">
      {/* Page Header - visible for all modes */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {mode === 'manual' && !isModeLocked('manual') && 'Code Scanner'}
            {mode === 'github' && !isModeLocked('github') && 'GitHub Repository Scan'}
            {mode === 'trends' && !isModeLocked('trends') && 'Quality Trends'}
            {mode === 'quality-gates' && !isModeLocked('quality-gates') && 'Quality Gates'}
            {mode === 'review' && !isModeLocked('review') && 'Code Review'}
            {mode === 'config' && !isModeLocked('config') && 'Scanner Configuration'}
            {mode === 'reports' && !isModeLocked('reports') && 'Reports'}
            {mode === 'insights' && !isModeLocked('insights') && 'Insights'}
            {mode === 'metrics' && !isModeLocked('metrics') && 'File Metrics'}
            {mode === 'hotspots' && !isModeLocked('hotspots') && 'Security Hotspots'}
            {mode === 'ratings' && !isModeLocked('ratings') && 'Quality Ratings'}
            {mode === 'activity' && !isModeLocked('activity') && 'Activity Timeline'}
            {mode === 'architecture' && !isModeLocked('architecture') && 'Architecture'}
            {mode === 'pr' && !isModeLocked('pr') && 'Pull Requests'}
            {mode === 'branches' && !isModeLocked('branches') && 'Branch Analytics'}
            {mode === 'team' && !isModeLocked('team') && 'Team Leaderboard'}
            {mode === 'dependencies' && !isModeLocked('dependencies') && 'Dependency Vulnerability Scan'}
            {mode === 'secrets' && !isModeLocked('secrets') && 'Secret Detection'}
            {mode === 'chat' && !isModeLocked('chat') && 'Codebase Assistant'}
            {mode === 'patterns' && !isModeLocked('patterns') && 'Pattern Detection'}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && 'PR Impact Analysis'}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && 'Code Scanner'}
            {isModeLocked(mode) && <span className="text-muted-foreground">Locked Feature</span>}
          </h1>
          <p className="text-muted-foreground mt-1">
            {mode === 'manual' && !isModeLocked('manual') && 'Analyze code directly — paste code and get AI-powered insights on bugs, vulnerabilities, and quality.'}
            {mode === 'github' && !isModeLocked('github') && 'Connect your GitHub repositories and run automated quality scans on your codebase.'}
            {mode === 'trends' && !isModeLocked('trends') && 'Track code quality metrics over time across your projects and team.'}
            {mode === 'quality-gates' && !isModeLocked('quality-gates') && 'Set quality standards and thresholds for your code to pass before merge.'}
            {mode === 'review' && !isModeLocked('review') && 'Review code collaboratively with comments, suggestions, and approval workflows.'}
            {mode === 'config' && !isModeLocked('config') && 'Configure scan rules, thresholds, file filters, and notification preferences.'}
            {mode === 'reports' && !isModeLocked('reports') && 'Generate and export detailed code quality reports in PDF, JSON, or CSV format.'}
            {mode === 'insights' && !isModeLocked('insights') && 'View aggregate analytics on code quality, issue trends, and team performance.'}
            {mode === 'metrics' && !isModeLocked('metrics') && 'Browse per-file code metrics including complexity, coverage, duplication, and LOC.'}
            {mode === 'hotspots' && !isModeLocked('hotspots') && 'Review security-sensitive code locations that may need extra attention.'}
            {mode === 'ratings' && !isModeLocked('ratings') && 'View letter-grade quality ratings for security, reliability, and maintainability.'}
            {mode === 'activity' && !isModeLocked('activity') && 'View all code analysis events including scans, reviews, and quality gates.'}
            {mode === 'architecture' && !isModeLocked('architecture') && 'Explore your codebase architecture — components, dependencies, and health.'}
            {mode === 'pr' && !isModeLocked('pr') && 'View pull request quality analysis and gate status across your repositories.'}
            {mode === 'branches' && !isModeLocked('branches') && 'Compare quality metrics across Git branches and track improvements.'}
            {mode === 'team' && !isModeLocked('team') && 'See how your team ranks in code quality contributions and issue resolution.'}
            {mode === 'dependencies' && !isModeLocked('dependencies') && 'Check project dependencies against the OSV vulnerability database and embedded security advisories.'}
            {mode === 'secrets' && !isModeLocked('secrets') && 'Scan source code for hardcoded API keys, tokens, passwords, private keys, and other secrets.'}
            {mode === 'chat' && !isModeLocked('chat') && 'Interact with your codebase files using our advanced Gemini AI Assistant.'}
            {mode === 'patterns' && !isModeLocked('patterns') && 'Detect design patterns, anti-patterns, and React hook usage across your codebase.'}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && 'Analyze GitHub PR impact — affected components, blast radius, and dependency cascade analysis.'}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && 'Analyze code directly — paste code and get AI-powered insights on bugs, vulnerabilities, and quality.'}
          </p>
        </div>
      </div>

      {isModeLocked(mode) && (
        <Card className="flex items-center justify-center p-12 border-border bg-card/30">
          <div className="text-center">
            <Lock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-semibold text-foreground">Feature Locked</p>
            <p className="text-sm text-muted-foreground mt-1">This scanner mode is currently disabled by admin.</p>
          </div>
        </Card>
      )}

      {/* Manual Analysis Mode */}
      {mode === 'manual' && !isModeLocked('manual') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <Card className="bg-card border border-border p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Programming Language</label>
                <div className="flex items-center gap-2">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
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
                  {detectedLang && detectedLang !== language && (
                    <span className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      Detected: {detectedLang.charAt(0).toUpperCase() + detectedLang.slice(1)}
                    </span>
                  )}
                </div>
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
                    onChange={handleCodeChange}
                    language={language}
                    height={360}
                    liveAnalysis={false}
                    theme="vs-dark"
                    diagnostics={[]}
                  />
                ) : (
                  <textarea
                    value={code}
                    onChange={(e) => handleCodeChange(e.target.value)}
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
                  onClick={handleRunCode}
                  disabled={executing || !code.trim()}
                  variant="secondary"
                  className="flex-1"
                >
                  {executing ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Code
                    </>
                  )}
                </Button>
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
                {(analysis || execResult) && (
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
                  codeSnippet: scan.codeSnippet,
                }))}
                page={scanPage}
                totalPages={Math.max(1, Math.ceil(scansTotalCount / SCANS_PER_PAGE))}
                onPageChange={(p) => { setScanPage(p); fetchScanHistory(p) }}
                onSelectScan={(scan) => {
                  const historyItem = scanHistory.find((h) => h.id === scan.id)
                  if (historyItem) {
                    setAnalysis(historyItem)
                    if (historyItem.codeSnippet) {
                      setCode(historyItem.codeSnippet)
                      if (historyItem.language) setLanguage(historyItem.language)
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                onEdit={(scan) => {
                  const historyItem = scanHistory.find((h) => h.id === scan.id)
                  if (historyItem) {
                    if (historyItem.codeSnippet) {
                      setCode(historyItem.codeSnippet)
                    }
                    if (historyItem.language) {
                      setLanguage(historyItem.language)
                    }
                    setAnalysis(historyItem)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                onDelete={async (scanId) => {
                  try {
                    await csrfFetch(`/api/analysis-history?id=${scanId}`, { method: 'DELETE', credentials: 'include' })
                  } catch {
                    /* offline or unauthenticated */
                  }
                  fetchScanHistory(scanPage)
                  if (analysis?.id === scanId) {
                    setAnalysis(null)
                  }
                }}
              />
            )}
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            {/* Execution Output */}
            {execResult && (
              <Card className="border border-border bg-card/30 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-green-400" />
                    Execution Output
                  </h4>
                  {execResult.code !== null && (
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      execResult.code === 0
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      Exit code: {execResult.code}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-3 text-sm font-mono">
                  {execResult.compileOutput && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Compile Output</p>
                      <pre className="whitespace-pre-wrap text-foreground/80 bg-background/50 rounded p-2 max-h-32 overflow-y-auto text-xs">
                        {execResult.compileOutput}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">stdout</p>
                    <pre className={`whitespace-pre-wrap rounded p-2 max-h-48 overflow-y-auto text-xs ${
                      execResult.stdout
                        ? 'bg-background/50 text-foreground/80'
                        : 'text-muted-foreground/40 italic'
                    }`}>
                      {execResult.stdout || '(no output)'}
                    </pre>
                  </div>
                  {execResult.stderr && (
                    <div>
                      <p className="text-xs text-red-400 mb-1 uppercase tracking-wider">stderr</p>
                      <pre className="whitespace-pre-wrap rounded p-2 max-h-32 overflow-y-auto text-xs bg-red-950/20 text-red-300 border border-red-500/10">
                        {execResult.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            )}

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
            ) : analysis.issues.some((i) => i.rule === 'not-code') ? (
              <Card className="border-red-500/50 bg-red-950/20 p-6 space-y-4 shadow-lg shadow-red-950/10">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-2.5 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        AST Verification Failed
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">Status: Non-Code Input / Plain Text</span>
                    </div>
                    <h3 className="text-xl font-bold text-red-200">
                      Invalid Source Code Detected
                    </h3>
                    <p className="text-sm text-red-200/80 leading-relaxed">
                      The input you provided (<code>{code.slice(0, 50)}{code.length > 50 ? '...' : ''}</code>) does not match the syntax, keywords, or structure of any supported programming language (e.g., JavaScript, TypeScript, Python, Java, C++, Go, Rust).
                    </p>
                    <div className="rounded-lg bg-background/60 border border-red-500/20 p-4 text-xs text-foreground/80 space-y-2">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-primary shrink-0" /> Why is valid code required?
                      </p>
                      <p className="leading-relaxed">
                        CodeSpectra performs Abstract Syntax Tree (AST) parsing, static control flow analysis, and cyclomatic complexity scoring to compute bug risks, security hotspots, code smells, and maintainability indexes accurately. Random text or non-code strings cannot be analyzed.
                      </p>
                    </div>
                  </div>
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
      {mode === 'github' && !isModeLocked('github') && (
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
      {mode === 'trends' && !isModeLocked('trends') && (
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
      {mode === 'quality-gates' && !isModeLocked('quality-gates') && <QualityGatesLivePanel />}

      {/* Code Review Mode */}
      {mode === 'review' && !isModeLocked('review') && (
        <CodeReviewPanel
          issueId="issue-1"
          comments={[]}
          onAddComment={(text) => console.log('Added comment:', text)}
          onReply={(commentId, text) => console.log('Replied to', commentId, ':', text)}
          onResolve={(issueId) => console.log('Resolved:', issueId)}
        />
      )}

      {/* Configuration Mode */}
      {mode === 'config' && !isModeLocked('config') && (
        <ScannerConfigPanel
          onSave={(config) => console.log('Config saved:', config)}
        />
      )}

      {/* Reports Mode */}
      {mode === 'reports' && !isModeLocked('reports') && (
        <ReportGenerator
          onExport={(format) => console.log('Exporting as:', format)}
          onEmail={(recipients) => console.log('Emailing to:', recipients)}
          onShare={(link) => console.log('Share link:', link)}
        />
      )}

      {/* Insights Mode */}
      {mode === 'insights' && !isModeLocked('insights') && (
        <InsightsDashboard />
      )}

      {/* Metrics Browser Mode */}
      {mode === 'metrics' && !isModeLocked('metrics') && (
        <MetricsFileBrowser />
      )}

      {/* Security Hotspots Mode */}
      {mode === 'hotspots' && !isModeLocked('hotspots') && (
        <SecurityHotspots />
      )}

      {/* Quality Ratings Mode */}
      {mode === 'ratings' && !isModeLocked('ratings') && (
        <QualityRatings />
      )}

      {/* Activity Timeline Mode */}
      {mode === 'activity' && !isModeLocked('activity') && (
        <ActivityTimeline />
      )}

      {/* Architecture Visualization Mode */}
      {mode === 'architecture' && !isModeLocked('architecture') && (
        <ArchitectureVisualization />
      )}

      {/* PR Integration Mode */}
      {mode === 'pr' && !isModeLocked('pr') && (
        <PRIntegration />
      )}

      {/* Branch Analytics Mode */}
      {mode === 'branches' && !isModeLocked('branches') && (
        <BranchAnalytics />
      )}

      {/* Team Mode */}
      {mode === 'team' && !isModeLocked('team') && (
        <TeamLeaderboard />
      )}

      {/* Dependency Scan Mode */}
      {mode === 'dependencies' && !isModeLocked('dependencies') && (
        <div className="max-w-4xl mx-auto">
          <DependencyScannerPanel />
        </div>
      )}

      {/* Secret Detection Mode */}
      {mode === 'secrets' && !isModeLocked('secrets') && (
        <div className="max-w-4xl mx-auto">
          <SecretScannerPanel />
        </div>
      )}

      {/* Pattern Detection Mode */}
      {mode === 'patterns' && !isModeLocked('patterns') && (
        <div className="space-y-6">
          <Card className="p-5 bg-card/30 border-dashed">
            <h3 className="font-semibold text-foreground mb-1">Pattern Detection</h3>
            <p className="text-sm text-muted-foreground">Detect design patterns, React hooks, and anti-patterns in your codebase. Supports common architectural patterns including singleton, factory, observer, decorator, and more.</p>
          </Card>
          <PatternDetector />
        </div>
      )}

      {/* PR Impact Analysis Mode */}
      {mode === 'pr-impact' && !isModeLocked('pr-impact') && (
        <div className="space-y-6">
          <Card className="p-5 bg-card/30 border-dashed">
            <h3 className="font-semibold text-foreground mb-1">PR Impact Analysis</h3>
            <p className="text-sm text-muted-foreground">Paste any GitHub pull request URL to see which architecture components it affects and compute its blast radius across your dependency graph.</p>
          </Card>
          <PRImpactAnalysis
            components={[]}
            dependencies={[]}
          />
        </div>
      )}

      {/* Codebase Chat Mode */}
      {mode === 'chat' && !isModeLocked('chat') && (
        <div className="max-w-4xl mx-auto">
          <CodebaseChatSidebar 
            scanId={analysis?.scanId}
            files={analysis ? [
              {
                path: 'analyzed_snippet',
                language: analysis.language || 'typescript',
                loc: 120,
                complexity: analysis.complexityScore || 5,
                bugs: analysis.bugs || 0,
                vulnerabilities: analysis.vulnerabilities || 0,
                codeSmells: analysis.codeSmells || 0,
              }
            ] : []}
          />
        </div>
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
  const gate = usePageGuard('user')
  if (!gate.ready) return null

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

