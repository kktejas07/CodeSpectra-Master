'use client'

import { useMemo, useState, Suspense, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLockedFeatures } from '@/lib/use-page-guard'
import { Code2, Sparkles, Loader, Plus, BarChart3, Settings, FileText, Users, Shield, Activity, GitBranch, GitPullRequest, Zap, HelpCircle, AlertTriangle, Info, Lock, Play, Loader2 } from 'lucide-react'
import { Github } from '@/components/ui/brand-icons'
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
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel } from '@/components/app/page-kit'

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

  const { startTour, setTourSeen } = useTour()

  // Initialize tour if this is the first visit to scanner
  useEffect(() => {
    if (mode === 'manual') {
      const scannerTour: TourStep[] = [
        {
          target: '[data-tour="scanner-code-input"]',
          title: 'Manual code scanner',
          description: 'Manual scan page: paste code here for bug and quality feedback.',
          position: 'bottom',
        },
        {
          target: '[data-tour="scanner-scan-button"]',
          title: 'Run code scan',
          description: 'Click Scan Code to analyze pasted code and reveal quality issues.',
          position: 'bottom',
        },
        {
          target: '[data-tour="scanner-results"]',
          title: 'Review quality results',
          description: 'Review quality score, issues, fixes, and recommendations after each scan.',
          position: 'top',
        },
        {
          target: '[data-tour="scanner-history"]',
          title: 'Reload past scans',
          description: 'Tip: select any past scan to reload its code and results instantly.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('scanner', scannerTour)}
  }, [mode, startTour, setTourSeen])
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
            map[(r.language || '').toLowerCase()] = r.language
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
      <PageHeader
        className="mb-0"
        icon={isModeLocked(mode) ? <Lock /> : <Code2 />}
        title={<>
            {mode === 'github' && !isModeLocked('github') && 'GitHub repository scan'}
            {mode === 'trends' && !isModeLocked('trends') && 'Quality trends'}
            {mode === 'quality-gates' && !isModeLocked('quality-gates') && 'Quality gates'}
            {mode === 'review' && !isModeLocked('review') && 'Code review'}
            {mode === 'config' && !isModeLocked('config') && 'Scanner settings'}
            {mode === 'reports' && !isModeLocked('reports') && 'Reports'}
            {mode === 'insights' && !isModeLocked('insights') && 'Insights'}
            {mode === 'metrics' && !isModeLocked('metrics') && 'File metrics'}
            {mode === 'hotspots' && !isModeLocked('hotspots') && 'Security hotspots'}
            {mode === 'ratings' && !isModeLocked('ratings') && 'Quality ratings'}
            {mode === 'activity' && !isModeLocked('activity') && 'Activity timeline'}
            {mode === 'architecture' && !isModeLocked('architecture') && 'Architecture'}
            {mode === 'pr' && !isModeLocked('pr') && 'Pull requests'}
            {mode === 'branches' && !isModeLocked('branches') && 'Branch analytics'}
            {mode === 'team' && !isModeLocked('team') && 'Team leaderboard'}
            {mode === 'dependencies' && !isModeLocked('dependencies') && 'Dependency vulnerability scan'}
            {mode === 'secrets' && !isModeLocked('secrets') && 'Secret detection'}
            {mode === 'chat' && !isModeLocked('chat') && 'Codebase assistant'}
            {mode === 'patterns' && !isModeLocked('patterns') && 'Pattern detection'}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && 'PR impact analysis'}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && 'Code scanner'}
            {isModeLocked(mode) && <span className="text-muted-foreground">Feature locked</span>}
        </>}
        description={<>
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
            {mode === 'chat' && !isModeLocked('chat') && 'Ask questions about your scanned code and get answers from the AI assistant.'}
            {mode === 'patterns' && !isModeLocked('patterns') && 'Detect design patterns, anti-patterns, and React hook usage across your codebase.'}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && 'Analyze GitHub PR impact — affected components, blast radius, and dependency cascade analysis.'}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && 'Paste code and get AI-powered feedback on bugs, vulnerabilities and quality.'}
        </>}
      />

      {isModeLocked(mode) && (
        <Panel className="flex flex-col items-center justify-center p-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Lock className="h-6 w-6" aria-hidden />
          </span>
          <p className="font-semibold text-foreground">This tool is turned off</p>
          <p className="mt-1 text-sm text-muted-foreground">An admin has disabled this scanner mode. Ask them to turn it on, or pick another tool from the sidebar.</p>
        </Panel>
      )}

      {/* Manual Analysis Mode */}
      {mode === 'manual' && !isModeLocked('manual') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <Panel className="space-y-4">
              <div>
                <label htmlFor="scanner-language" className="text-sm font-medium text-foreground block mb-2">Programming language</label>
                <div className="flex items-center gap-2">
                  <select
                    id="scanner-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    {runtimesLoading ? (
                      <option value="">Loading languages…</option>
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
                    <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      Detected: {detectedLang.charAt(0).toUpperCase() + detectedLang.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2" data-tour="scanner-code-input">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">Paste your code</label>
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
                    placeholder="Paste your code here for analysis…"
                    aria-label="Code to scan"
                    className="h-96 w-full resize-none rounded-2xl border border-border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  The editor view adds syntax highlighting. Press <strong>Scan code</strong> to save the scan to your history.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleRunCode}
                  disabled={executing || !code.trim()}
                  variant="secondary"
                  className="flex-1"
                >
                  {executing ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run code
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleAnalyze}
                  disabled={loading || !code.trim()}
                  className="flex-1"
                  data-tour="scanner-scan-button"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Scan code
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
                <div className="pt-4 border-t border-border text-xs tabular-nums text-muted-foreground">
                  Analysis completed in {analysis.timeMs}ms
                </div>
              )}
            </Panel>

            {/* Scan History */}
            <div data-tour="scanner-history">
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
          </div>

          {/* Results Section */}
          <div className="space-y-4">
            {/* Execution Output */}
            {execResult && (
              <Card className="gap-0 overflow-hidden rounded-3xl py-0">
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-primary" />
                    Output
                  </h4>
                  {execResult.code !== null && (
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      execResult.code === 0
                        ? 'bg-green-500/10 text-green-700 border border-green-500/20 dark:text-green-400'
                        : 'bg-red-500/10 text-red-700 border border-red-500/20 dark:text-red-400'
                    }`}>
                      Exit code: {execResult.code}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-3 text-sm font-mono">
                  {execResult.compileOutput && (
                    <div>
                      <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">Compiler output</p>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs text-foreground">
                        {execResult.compileOutput}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">Standard output</p>
                    <pre className={`whitespace-pre-wrap rounded p-2 max-h-48 overflow-y-auto text-xs ${
                      execResult.stdout
                        ? 'bg-muted/60 text-foreground'
                        : 'text-muted-foreground italic'
                    }`}>
                      {execResult.stdout || '(no output)'}
                    </pre>
                  </div>
                  {execResult.stderr && (
                    <div>
                      <p className="mb-1 font-sans text-xs font-medium text-red-700 dark:text-red-400">Errors</p>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
                        {execResult.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {loading ? (
              <div className="space-y-4 animate-pulse motion-reduce:animate-none">
                <div className="rounded-3xl border border-border/70 bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-6 w-32 bg-muted/60 rounded" />
                    <div className="h-6 w-16 bg-muted/60 rounded" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-3 w-16 bg-muted/50 rounded" />
                        <div className="h-5 w-12 bg-muted/60 rounded" />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border/40 pt-4">
                    <div className="h-4 w-48 bg-muted/60 rounded mb-2" />
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="h-4 w-4 bg-muted/50 rounded mt-0.5" />
                          <div className="h-3 w-full bg-muted/50 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-border/70 bg-card p-5 space-y-3">
                  <div className="h-4 w-40 bg-muted/60 rounded" />
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 bg-muted/50 rounded" />
                    <div className="h-4 w-12 bg-muted/60 rounded" />
                  </div>
                  <div className="h-16 w-full bg-muted/50 rounded" />
                </div>
              </div>
            ) : !analysis ? (
              <Panel className="flex h-full min-h-[280px] items-center justify-center border-dashed">
                <div className="flex flex-col items-center p-6 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Code2 className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="font-medium text-foreground">
                    Paste your code and press <strong>Scan code</strong> to see the analysis
                  </p>
                  <p className="mt-2 max-w-md text-xs text-muted-foreground">
                    Supports: {runtimesLoading ? 'Loading…' : runtimes.length > 0 ? runtimes.map(rt => rt.language).join(', ') : 'most popular languages (detected automatically)'}
                  </p>
                </div>
              </Panel>
            ) : analysis.issues.some((i) => i.rule === 'not-code') ? (
              <Card className="gap-0 space-y-4 rounded-3xl border-red-500/40 bg-red-500/5 p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-2.5 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400">
                        Couldn&apos;t parse this input
                      </span>
                      <span className="text-xs text-muted-foreground">Looks like plain text, not code</span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      This doesn&apos;t look like source code
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      The input you provided (<code>{code.slice(0, 50)}{code.length > 50 ? '...' : ''}</code>) does not match the syntax, keywords, or structure of any supported programming language (e.g., JavaScript, TypeScript, Python, Java, C++, Go, Rust).
                    </p>
                    <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-primary shrink-0" /> Why does it need valid code?
                      </p>
                      <p className="leading-relaxed">
                        CodeSpectra parses the structure of your code to find bugs, security risks, code smells and complexity. Plain text has no structure to analyse, so paste a real snippet and try again.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-4" data-tour="scanner-results">
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
                  <Panel className="p-5">
                    <h4 className="text-base font-semibold text-foreground mb-2">Performance</h4>
                    <p className="text-sm text-muted-foreground">{analysis.performance}</p>
                  </Panel>
                )}

                {/* Best Practices */}
                {analysis.bestPractices.length > 0 && (
                  <Card className="gap-0 rounded-3xl border-green-500/30 bg-green-500/5 p-5">
                    <h4 className="text-base mb-3 font-semibold text-green-700 dark:text-green-400">What you did well</h4>
                    <ul className="space-y-2">
                      {analysis.bestPractices.map((practice, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span className="text-green-600 dark:text-green-400" aria-hidden>✓</span>
                          {practice}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Suggestions */}
                {analysis.suggestions.length > 0 && (
                  <Card className="gap-0 rounded-3xl border-primary/25 bg-primary/5 p-5">
                    <h4 className="text-base mb-3 font-semibold text-primary">Recommendations</h4>
                    <ul className="space-y-2">
                      {analysis.suggestions.map((suggestion, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span className="text-primary" aria-hidden>→</span>
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

            <Panel>
              <h3 className="text-base mb-4 font-semibold text-foreground">GitHub setup notes</h3>
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
            </Panel>
          </div>

          <div className="space-y-4">
            {!analysis ? (
              <Panel className="flex min-h-[280px] items-center justify-center border-dashed">
                <div className="flex flex-col items-center text-center text-muted-foreground">
                  <Code2 className="mb-3 h-10 w-10 text-primary/50" aria-hidden />
                  <p className="text-sm">Pick a repository, then click a file to scan it. Results are saved to your history.</p>
                </div>
              </Panel>
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
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Code quality trends</h3>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Sample data</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              See how your quality metrics change over time. The chart below shows example figures, not your scans.
            </p>
          </Panel>
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
        <div>
          <DependencyScannerPanel />
        </div>
      )}

      {/* Secret Detection Mode */}
      {mode === 'secrets' && !isModeLocked('secrets') && (
        <div>
          <SecretScannerPanel />
        </div>
      )}

      {/* Pattern Detection Mode */}
      {mode === 'patterns' && !isModeLocked('patterns') && (
        <div className="space-y-6">
          <Panel className="border-dashed p-5">
            <h3 className="text-base font-semibold text-foreground mb-1">Pattern detection</h3>
            <p className="text-sm text-muted-foreground">Detect design patterns, React hooks, and anti-patterns in your codebase. Supports common architectural patterns including singleton, factory, observer, decorator, and more.</p>
          </Panel>
          <PatternDetector />
        </div>
      )}

      {/* PR Impact Analysis Mode */}
      {mode === 'pr-impact' && !isModeLocked('pr-impact') && (
        <div className="space-y-6">
          <Panel className="border-dashed p-5">
            <h3 className="text-base font-semibold text-foreground mb-1">PR impact analysis</h3>
            <p className="text-sm text-muted-foreground">Paste any GitHub pull request URL to see which architecture components it affects and compute its blast radius across your dependency graph.</p>
          </Panel>
          <PRImpactAnalysis
            components={[]}
            dependencies={[]}
          />
        </div>
      )}

      {/* Codebase Chat Mode */}
      {mode === 'chat' && !isModeLocked('chat') && (
        <div>
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
                <p><strong>Manual analysis:</strong> Scan code directly</p>
                <p><strong>GitHub:</strong> Connect and scan repos</p>
                <p><strong>Trends:</strong> Track quality over time</p>
                <p><strong>Quality gates:</strong> Set quality standards</p>
                <p><strong>Code review:</strong> Collaborative reviews</p>
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

