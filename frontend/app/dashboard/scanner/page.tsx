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
import { CodeDiffViewer } from '@/components/scanner/code-diff-viewer'
import { QualityGatesLivePanel } from '@/components/scanner/quality-gates-live-panel'
import { EmptyState } from '@/components/ui/empty-state'
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
import { Illustration } from '@/components/illustrations/spot'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
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
          title: t('tools.manualCodeScanner'),
          description: t('tools.manualScanPagePasteCodeHerea47'),
          position: 'bottom',
        },
        {
          target: '[data-tour="scanner-scan-button"]',
          title: t('tools.runCodeScan'),
          description: t('tools.clickScanCodeToAnalyzePastedd54'),
          position: 'bottom',
        },
        {
          target: '[data-tour="scanner-results"]',
          title: t('tools.reviewQualityResults'),
          description: t('tools.reviewQualityScoreIssuesFixesAnd017'),
          position: 'top',
        },
        {
          target: '[data-tour="scanner-history"]',
          title: t('tools.reloadPastScans'),
          description: t('tools.tipSelectAnyPastScanToac0'),
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
        illustration="scanner"
        className="mb-0"
        icon={isModeLocked(mode) ? <Lock /> : <Code2 />}
        title={<>
            {mode === 'github' && !isModeLocked('github') && t('tools.githubRepositoryScan')}
            {mode === 'trends' && !isModeLocked('trends') && t('tools.qualityTrends')}
            {mode === 'quality-gates' && !isModeLocked('quality-gates') && t('tools.qualityGates')}
            {mode === 'review' && !isModeLocked('review') && t('tools.codeReview')}
            {mode === 'config' && !isModeLocked('config') && t('tools.scannerSettings')}
            {mode === 'reports' && !isModeLocked('reports') && t('tools.reports')}
            {mode === 'insights' && !isModeLocked('insights') && t('tools.insights')}
            {mode === 'metrics' && !isModeLocked('metrics') && t('tools.fileMetrics')}
            {mode === 'hotspots' && !isModeLocked('hotspots') && t('tools.securityHotspots')}
            {mode === 'ratings' && !isModeLocked('ratings') && t('tools.qualityRatings')}
            {mode === 'activity' && !isModeLocked('activity') && t('tools.activityTimeline')}
            {mode === 'architecture' && !isModeLocked('architecture') && t('tools.architecture')}
            {mode === 'pr' && !isModeLocked('pr') && t('tools.pullRequests')}
            {mode === 'branches' && !isModeLocked('branches') && t('tools.branchAnalytics')}
            {mode === 'team' && !isModeLocked('team') && t('tools.teamLeaderboard')}
            {mode === 'dependencies' && !isModeLocked('dependencies') && t('tools.dependencyVulnerabilityScan')}
            {mode === 'secrets' && !isModeLocked('secrets') && t('tools.secretDetection')}
            {mode === 'chat' && !isModeLocked('chat') && t('tools.codebaseAssistant')}
            {mode === 'patterns' && !isModeLocked('patterns') && t('tools.patternDetection')}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && t('tools.prImpactAnalysis')}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && t('tools.codeScanner')}
            {isModeLocked(mode) && <span className="text-muted-foreground">{t('tools.featureLocked')}</span>}
        </>}
        description={<>
            {mode === 'github' && !isModeLocked('github') && t('tools.connectYourGithubRepositoriesAndRun39d')}
            {mode === 'trends' && !isModeLocked('trends') && t('tools.trackCodeQualityMetricsOverTime02a')}
            {mode === 'quality-gates' && !isModeLocked('quality-gates') && t('tools.setQualityStandardsAndThresholdsFor397')}
            {mode === 'review' && !isModeLocked('review') && t('tools.reviewCodeCollaborativelyWithCommentsSug12d')}
            {mode === 'config' && !isModeLocked('config') && t('tools.configureScanRulesThresholdsFileFiltersc2b')}
            {mode === 'reports' && !isModeLocked('reports') && t('tools.generateAndExportDetailedCodeQuality4b1')}
            {mode === 'insights' && !isModeLocked('insights') && t('tools.viewAggregateAnalyticsOnCodeQualityd60')}
            {mode === 'metrics' && !isModeLocked('metrics') && t('tools.browsePerFileCodeMetricsIncludingbcc')}
            {mode === 'hotspots' && !isModeLocked('hotspots') && t('tools.reviewSecuritySensitiveCodeLocationsThat750')}
            {mode === 'ratings' && !isModeLocked('ratings') && t('tools.viewLetterGradeQualityRatingsFore7d')}
            {mode === 'activity' && !isModeLocked('activity') && t('tools.viewAllCodeAnalysisEventsIncludingde6')}
            {mode === 'architecture' && !isModeLocked('architecture') && t('tools.exploreYourCodebaseArchitectureComponent324')}
            {mode === 'pr' && !isModeLocked('pr') && t('tools.viewPullRequestQualityAnalysisAndafb')}
            {mode === 'branches' && !isModeLocked('branches') && t('tools.compareQualityMetricsAcrossGitBranches1e3')}
            {mode === 'team' && !isModeLocked('team') && t('tools.seeHowYourTeamRanksIndfa')}
            {mode === 'dependencies' && !isModeLocked('dependencies') && t('tools.checkProjectDependenciesAgainstTheOsv3f2')}
            {mode === 'secrets' && !isModeLocked('secrets') && t('tools.scanSourceCodeForHardcodedApi892')}
            {mode === 'chat' && !isModeLocked('chat') && t('tools.askQuestionsAboutYourScannedCode81e')}
            {mode === 'patterns' && !isModeLocked('patterns') && t('tools.detectDesignPatternsAntiPatternsAnd8e4')}
            {mode === 'pr-impact' && !isModeLocked('pr-impact') && t('tools.analyzeGithubPrImpactAffectedComponents33d')}
            {(!mode || mode === 'manual') && !isModeLocked('manual') && t('tools.pasteCodeAndGetAiPoweredbd8')}
        </>}
      />

      {isModeLocked(mode) && (
        <Panel className="flex flex-col items-center justify-center p-12 text-center">
          <Illustration name="locked" className="mb-3 w-36" />
          <p className="font-semibold text-foreground">{t('tools.thisToolIsTurnedOff')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('tools.anAdminHasDisabledThisScannerf7c')}</p>
        </Panel>
      )}

      {/* Manual Analysis Mode */}
      {mode === 'manual' && !isModeLocked('manual') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-4">
            <Panel className="space-y-4">
              <div>
                <label htmlFor="scanner-language" className="text-sm font-medium text-foreground block mb-2">{t('tools.programmingLanguage')}</label>
                <div className="flex items-center gap-2">
                  <select
                    id="scanner-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  >
                    {runtimesLoading ? (
                      <option value="">{t('tools.loadingLanguages')}</option>
                    ) : runtimes.length > 0 ? (
                      runtimes.map((rt) => (
                        <option key={rt.language || rt.version} value={rt.language}>
                          {(rt.language || '').charAt(0).toUpperCase() + (rt.language || '').slice(1)}
                        </option>
                      ))
                    ) : (
                      <option value="">{t('tools.noRuntimesLoaded')}</option>
                    )}
                  </select>
                  {detectedLang && detectedLang !== language && (
                    <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{t('tools.detected')}{' '}{detectedLang.charAt(0).toUpperCase() + detectedLang.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2" data-tour="scanner-code-input">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">{t('tools.pasteYourCode')}</label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setUseMonacoEditor((v) => !v)}
                  >
                    {useMonacoEditor ? t('tools.plainTextarea') : t('tools.monacoEditor')}
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
                    placeholder={t('tools.pasteYourCodeHereForAnalysis')}
                    aria-label={t('tools.codeToScan')}
                    className="h-96 w-full resize-none rounded-2xl border border-border bg-background p-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
                <p className="text-xs text-muted-foreground">{t('tools.theEditorViewAddsSyntaxHighlighting312')}{' '}<strong>{t('tools.scanCode')}</strong>{' '}{t('tools.toSaveTheScanToYour408')}</p>
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
                      <Loader className="w-4 h-4 mr-2 animate-spin" />{t('tools.running')}</>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />{t('tools.runCode')}</>
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
                      <Loader className="w-4 h-4 mr-2 animate-spin" />{t('tools.analyzing')}</>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />{t('tools.scanCode')}</>
                  )}
                </Button>
                {(analysis || execResult) && (
                  <Button variant="outline" onClick={clearAnalysis}>{t('tools.clear')}</Button>
                )}
              </div>

              {analysis && (
                <div className="pt-4 border-t border-border text-xs tabular-nums text-muted-foreground">{t('tools.analysisCompletedInTimemsMs', { timeMs: analysis.timeMs })}</div>
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
                    <Play className="w-3.5 h-3.5 text-primary" />{t('tools.output')}</h4>
                  {execResult.code !== null && (
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      execResult.code === 0
                        ? 'bg-green-500/10 text-green-700 border border-green-500/20 dark:text-green-400'
                        : 'bg-red-500/10 text-red-700 border border-red-500/20 dark:text-red-400'
                    }`}>{t('tools.exitCodeCode', { code: execResult.code })}</span>
                  )}
                </div>
                <div className="p-4 space-y-3 text-sm font-mono">
                  {execResult.compileOutput && (
                    <div>
                      <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">{t('tools.compilerOutput')}</p>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs text-foreground">
                        {execResult.compileOutput}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">{t('tools.standardOutput')}</p>
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
                      <p className="mb-1 font-sans text-xs font-medium text-red-700 dark:text-red-400">{t('tools.errors')}</p>
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
                  <Illustration name="scanner" className="mb-3 w-36" />
                  <p className="font-medium text-foreground">{t('tools.pasteYourCodeAndPress')}{' '}<strong>{t('tools.scanCode')}</strong>{' '}{t('tools.toSeeTheAnalysis')}</p>
                  <p className="mt-2 max-w-md text-xs text-muted-foreground">{t('tools.supports')}{' '}{runtimesLoading ? t('common.loading') : runtimes.length > 0 ? runtimes.map(rt => rt.language).join(', ') : t('tools.mostPopularLanguagesDetectedAutomaticall')}
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
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400">{t('tools.couldntParseThisInput')}</span>
                      <span className="text-xs text-muted-foreground">{t('tools.looksLikePlainTextNotCode')}</span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{t('tools.thisDoesntLookLikeSourceCode')}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{t('tools.theInputYouProvided')}<code>{code.slice(0, 50)}{code.length > 50 ? '...' : ''}</code>{t('tools.doesNotMatchTheSyntaxKeywords37e')}</p>
                    <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-primary shrink-0" />{' '}{t('tools.whyDoesItNeedValidCode')}</p>
                      <p className="leading-relaxed">{t('tools.codespectraParsesTheStructureOfYour3ef')}</p>
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
                    <h4 className="text-base font-semibold text-foreground mb-2">{t('tools.performance')}</h4>
                    <p className="text-sm text-muted-foreground">{analysis.performance}</p>
                  </Panel>
                )}

                {/* Best Practices */}
                {analysis.bestPractices.length > 0 && (
                  <Card className="gap-0 rounded-3xl border-green-500/30 bg-green-500/5 p-5">
                    <h4 className="text-base mb-3 font-semibold text-green-700 dark:text-green-400">{t('tools.whatYouDidWell')}</h4>
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
                    <h4 className="text-base mb-3 font-semibold text-primary">{t('tools.recommendations')}</h4>
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
              <h3 className="text-base mb-4 font-semibold text-foreground">{t('tools.githubSetupNotes')}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Plus className="h-4 w-4" />{t('tools.webhooks')}</h4>
                  <p className="text-sm text-foreground/60">{t('tools.pointRepoWebhooksTo')}{' '}<code className="rounded bg-muted px-1 text-xs">/api/github/webhook</code>{' '}{t('tools.with')}{' '}<code className="rounded bg-muted px-1 text-xs">GITHUB_WEBHOOK_SECRET</code>{' '}{t('tools.deliveriesAreLoggedForAudit')}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Plus className="h-4 w-4" />{t('tools.tokenEncryption')}</h4>
                  <p className="text-sm text-foreground/60">{t('tools.set')}{' '}<code className="rounded bg-muted px-1 text-xs">GITHUB_TOKEN_ENCRYPTION_KEY</code>{' '}{t('tools.base6432BytesSoNewOauthbc4')}</p>
                </div>
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            {!analysis ? (
              <Panel className="flex min-h-[280px] items-center justify-center border-dashed">
                <div className="flex flex-col items-center text-center text-muted-foreground">
                  <Code2 className="mb-3 h-10 w-10 text-primary/50" aria-hidden />
                  <p className="text-sm">{t('tools.pickARepositoryThenClickA69f')}</p>
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

      {/* Metrics Trend Mode — no per-scan history is stored yet, so no chart. */}
      {mode === 'trends' && !isModeLocked('trends') && (
        <EmptyState illustration="analytics"
          title={t('tools.qualityTrendsArentAvailableYet')}
          description={t('tools.weDontKeepAHistoryOf565')}
          actionLabel={t('tools.runAScan')}
          actionHref="/dashboard/scanner"
        />
      )}

      {/* Quality Gates Mode */}
      {mode === 'quality-gates' && !isModeLocked('quality-gates') && <QualityGatesLivePanel />}

      {/* Code Review Mode */}
      {mode === 'review' && !isModeLocked('review') && (
        <EmptyState illustration="scanner"
          title={t('tools.codeReviewIsntAvailableYet')}
          description={t('tools.commentsAndApprovalsOnScanIssuesab8')}
          actionLabel={t('tools.goToManualAnalysis')}
          actionHref="/dashboard/scanner"
        />
      )}

      {/* Configuration Mode */}
      {mode === 'config' && !isModeLocked('config') && (
        <EmptyState illustration="settings"
          title={t('tools.scannerSettingsArentAvailableYet')}
          description={t('tools.customThresholdsAndScanRulesCant910')}
          actionLabel={t('tools.goToManualAnalysis')}
          actionHref="/dashboard/scanner"
        />
      )}

      {/* Reports Mode */}
      {mode === 'reports' && !isModeLocked('reports') && (
        <ReportGenerator />
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
            <h3 className="text-base font-semibold text-foreground mb-1">{t('tools.patternDetection')}</h3>
            <p className="text-sm text-muted-foreground">{t('tools.detectDesignPatternsReactHooksAndb3c')}</p>
          </Panel>
          <PatternDetector />
        </div>
      )}

      {/* PR Impact Analysis Mode */}
      {mode === 'pr-impact' && !isModeLocked('pr-impact') && (
        <div className="space-y-6">
          <Panel className="border-dashed p-5">
            <h3 className="text-base font-semibold text-foreground mb-1">{t('tools.prImpactAnalysis')}</h3>
            <p className="text-sm text-muted-foreground">{t('tools.pasteAnyGithubPullRequestUrl25f')}</p>
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
            scanId={analysis?.id && !analysis.id.startsWith('scan-') ? analysis.id : undefined}
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
                <HelpCircle className="h-4 w-4 mr-1" />{' '}{t('tools.scannerTools')}</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[300px] p-3">
              <div className="grid gap-1.5 text-xs">
                <p><strong>{t('tools.manualAnalysis')}</strong>{' '}{t('tools.scanCodeDirectly')}</p>
                <p><strong>GitHub:</strong>{' '}{t('tools.connectAndScanRepos')}</p>
                <p><strong>{t('tools.trends')}</strong>{' '}{t('tools.trackQualityOverTime')}</p>
                <p><strong>{t('tools.qualityGates2')}</strong>{' '}{t('tools.setQualityStandards')}</p>
                <p><strong>{t('tools.codeReview2')}</strong>{' '}{t('tools.collaborativeReviews')}</p>
                <p><strong>{t('tools.configuration')}</strong>{' '}{t('tools.customizeRules')}</p>
                <p><strong>{t('tools.reports2')}</strong>{' '}{t('tools.exportResults')}</p>
                <p><strong>{t('tools.insights2')}</strong>{' '}{t('tools.dashboardAnalytics')}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

export default function CodeScannerPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  if (!gate.ready) return null

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">{t('tools.loadingScanner')}</div>
      }
    >
      <CodeScannerPageInner />
    </Suspense>
  )
}

