'use client'

import { useState } from 'react'
import { Code2, Sparkles, Loader, Github, Plus, BarChart3, Settings, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AdvancedMetrics } from '@/components/scanner/advanced-metrics'
import { SuggestedFixes } from '@/components/scanner/suggested-fixes'
import { GitHubIntegration } from '@/components/scanner/github-integration'
import { RepositoryBrowser } from '@/components/scanner/repository-browser'
import { ScanHistory } from '@/components/scanner/scan-history'
import { MetricsTrendChart } from '@/components/scanner/metrics-trend-chart'
import { CodeDiffViewer } from '@/components/scanner/code-diff-viewer'
import { QualityGateDashboard } from '@/components/scanner/quality-gate-dashboard'
import { CodeReviewPanel } from '@/components/scanner/code-review-panel'
import { ScannerConfigPanel } from '@/components/scanner/scanner-config-panel'
import { ReportGenerator } from '@/components/scanner/report-generator'
import { InsightsDashboard } from '@/components/scanner/insights-dashboard'
import { TeamLeaderboard } from '@/components/scanner/team-leaderboard'

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
}

type ScanMode = 'manual' | 'github' | 'quality-gates' | 'trends' | 'review' | 'config' | 'reports' | 'insights' | 'team'

export default function CodeScannerPage() {
  const [scanMode, setScanMode] = useState<ScanMode>('manual')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [scanHistory, setScanHistory] = useState<AnalysisResult[]>([])

  const handleAnalyze = async () => {
    if (!code.trim()) return

    setLoading(true)
    try {
      console.log('[v0] Starting code analysis...')
      const response = await fetch('/api/analyze-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })

      const result = await response.json()
      console.log('[v0] Analysis complete:', result)
      const analysisWithMetadata: AnalysisResult = {
        ...result,
        id: `scan-${Date.now()}`,
        timestamp: new Date(),
      }
      setAnalysis(analysisWithMetadata)
      setScanHistory([analysisWithMetadata, ...scanHistory.slice(0, 9)])
    } catch (error) {
      console.error('[v0] Analysis failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearAnalysis = () => {
    setCode('')
    setAnalysis(null)
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-card border border-border rounded-lg p-4 sticky top-20">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            Scanner Tools
          </h2>
          
          <nav className="space-y-2">
            <NavItem
              icon={<Code2 className="w-4 h-4" />}
              label="Manual Analysis"
              isActive={scanMode === 'manual'}
              onClick={() => setScanMode('manual')}
            />
            <NavItem
              icon={<Github className="w-4 h-4" />}
              label="GitHub Repos"
              isActive={scanMode === 'github'}
              onClick={() => setScanMode('github')}
            />
            <NavItem
              icon={<BarChart3 className="w-4 h-4" />}
              label="Trends"
              isActive={scanMode === 'trends'}
              onClick={() => setScanMode('trends')}
            />
            <NavItem
              icon={<Plus className="w-4 h-4" />}
              label="Quality Gates"
              isActive={scanMode === 'quality-gates'}
              onClick={() => setScanMode('quality-gates')}
            />
            <NavItem
              icon={<FileText className="w-4 h-4" />}
              label="Code Review"
              isActive={scanMode === 'review'}
              onClick={() => setScanMode('review')}
            />
            <NavItem
              icon={<Settings className="w-4 h-4" />}
              label="Configuration"
              isActive={scanMode === 'config'}
              onClick={() => setScanMode('config')}
            />
            <NavItem
              icon={<FileText className="w-4 h-4" />}
              label="Reports"
              isActive={scanMode === 'reports'}
              onClick={() => setScanMode('reports')}
            />
            <NavItem
              icon={<BarChart3 className="w-4 h-4" />}
              label="Insights"
              isActive={scanMode === 'insights'}
              onClick={() => setScanMode('insights')}
            />
            <NavItem
              icon={<Users className="w-4 h-4" />}
              label="Team"
              isActive={scanMode === 'team'}
              onClick={() => setScanMode('team')}
            />
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">

      {/* Manual Analysis Mode */}
      {scanMode === 'manual' && (
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
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="csharp">C#</option>
                  <option value="go">Go</option>
                  <option value="rust">Rust</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Paste Your Code</label>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your code here for analysis..."
                  className="w-full h-96 p-4 rounded-lg bg-background border border-border text-foreground placeholder:text-foreground/50 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
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
                  target: language,
                  language: language,
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
                    Supports: JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust
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
      {scanMode === 'github' && (
        <div className="space-y-6">
          <GitHubIntegration />
          <RepositoryBrowser
            onSelectRepository={(repo) => console.log('Selected repo:', repo)}
            onSelectFile={(file) => console.log('Selected file:', file)}
          />

          {/* Coming Soon Features */}
          <Card className="bg-card/30 border border-border p-6">
            <h3 className="font-semibold text-foreground mb-4">GitHub Features</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Automatic Scanning
                </h4>
                <p className="text-sm text-foreground/60">
                  Automatically scan your repositories on every push and pull request
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Pull Request Reviews
                </h4>
                <p className="text-sm text-foreground/60">
                  Get automatic code quality checks and suggestions on PR submissions
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Trend Analysis
                </h4>
                <p className="text-sm text-foreground/60">
                  Track code quality improvements over time with historical data
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Team Insights
                </h4>
                <p className="text-sm text-foreground/60">
                  Compare code quality across team members and repositories
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Metrics Trend Mode */}
      {scanMode === 'trends' && (
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
      {scanMode === 'quality-gates' && (
        <QualityGateDashboard
          gates={[]}
          onSave={(gate) => console.log('Saved gate:', gate)}
          onDelete={(id) => console.log('Deleted gate:', id)}
        />
      )}

      {/* Code Review Mode */}
      {scanMode === 'review' && (
        <CodeReviewPanel
          issueId="issue-1"
          comments={[]}
          onAddComment={(text) => console.log('Added comment:', text)}
          onReply={(commentId, text) => console.log('Replied to', commentId, ':', text)}
          onResolve={(issueId) => console.log('Resolved:', issueId)}
        />
      )}

      {/* Configuration Mode */}
      {scanMode === 'config' && (
        <ScannerConfigPanel
          onSave={(config) => console.log('Config saved:', config)}
        />
      )}

      {/* Reports Mode */}
      {scanMode === 'reports' && (
        <ReportGenerator
          onExport={(format) => console.log('Exporting as:', format)}
          onEmail={(recipients) => console.log('Emailing to:', recipients)}
          onShare={(link) => console.log('Share link:', link)}
        />
      )}

      {/* Insights Mode */}
      {scanMode === 'insights' && (
        <InsightsDashboard />
      )}

      {/* Team Mode */}
      {scanMode === 'team' && (
        <TeamLeaderboard />
      )}

      {/* Feature Overview */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-6">
        <h3 className="font-semibold text-foreground mb-3">Available Tools</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Manual Analysis:</span> Scan code directly
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">GitHub:</span> Connect and scan repositories
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Trends:</span> Track quality over time
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Quality Gates:</span> Set quality standards
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Code Review:</span> Collaborative reviews
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Configuration:</span> Customize scanner rules
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Reports:</span> Export analysis results
          </div>
          <div className="text-sm text-foreground/70">
            <span className="font-medium">Insights:</span> Dashboard analytics
          </div>
        </div>
      </Card>
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground/70 hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
