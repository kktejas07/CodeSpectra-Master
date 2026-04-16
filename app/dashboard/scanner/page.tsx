'use client'

import { useState } from 'react'
import { Code2, Sparkles, Loader, Github, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AdvancedMetrics } from '@/components/scanner/advanced-metrics'
import { SuggestedFixes } from '@/components/scanner/suggested-fixes'
import { GitHubIntegration } from '@/components/scanner/github-integration'

interface AnalysisResult {
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
}

type ScanMode = 'manual' | 'github'

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
      setAnalysis(result)
      setScanHistory([result, ...scanHistory.slice(0, 4)]) // Keep last 5 scans
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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Code2 className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Code Scanner</h1>
        </div>
        <p className="text-foreground/60">
          Advanced code analysis powered by AI, similar to SonarCloud with GitHub integration and real-time feedback
        </p>
      </div>

      {/* Scan Mode Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setScanMode('manual')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            scanMode === 'manual'
              ? 'border-primary text-primary'
              : 'border-transparent text-foreground/60 hover:text-foreground'
          }`}
        >
          <Code2 className="w-4 h-4 inline mr-2" />
          Manual Analysis
        </button>
        <button
          onClick={() => setScanMode('github')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            scanMode === 'github'
              ? 'border-primary text-primary'
              : 'border-transparent text-foreground/60 hover:text-foreground'
          }`}
        >
          <Github className="w-4 h-4 inline mr-2" />
          GitHub Integration
        </button>
      </div>

      {/* GitHub Integration Mode */}
      {scanMode === 'github' && (
        <div className="space-y-6">
          <GitHubIntegration />

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
              <Card className="bg-card border border-border p-6">
                <h3 className="font-semibold text-foreground mb-3">Recent Scans</h3>
                <div className="space-y-2">
                  {scanHistory.map((scan, idx) => (
                    <button
                      key={idx}
                      onClick={() => setAnalysis(scan)}
                      className="w-full text-left p-3 rounded bg-background hover:bg-background/80 border border-border/50 hover:border-primary/50 transition-all flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{language}</p>
                        <p className="text-xs text-foreground/50">Score: {scan.quality}/100</p>
                      </div>
                      <span className="text-sm font-bold text-primary">{scan.quality}</span>
                    </button>
                  ))}
                </div>
              </Card>
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

      {/* Feature Overview */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 p-6">
        <h3 className="font-semibold text-foreground mb-4">CodeSpectra Scanner Features</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Code Quality Score</p>
            <p className="text-xs text-foreground/60">0-100 rating based on comprehensive analysis</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Bug Detection</p>
            <p className="text-xs text-foreground/60">Find potential runtime errors and logical issues</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Security Analysis</p>
            <p className="text-xs text-foreground/60">Identify vulnerabilities and security hotspots</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Suggested Fixes</p>
            <p className="text-xs text-foreground/60">AI-powered recommendations with confidence levels</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">GitHub Integration</p>
            <p className="text-xs text-foreground/60">Connect repos and scan automatically on push</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Trend Tracking</p>
            <p className="text-xs text-foreground/60">Monitor code quality improvements over time</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
