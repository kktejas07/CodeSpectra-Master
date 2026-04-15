'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Code2, Send, AlertCircle, CheckCircle, Lightbulb } from 'lucide-react'

type AnalysisResult = {
  quality: number
  performance: string
  bestPractices: string[]
  issues: string[]
  suggestions: string[]
  timeMs: number
}

export default function CodeScannerPage() {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  const handleAnalyze = async () => {
    if (!code.trim()) return

    setLoading(true)
    try {
      const response = await fetch('/api/analyze-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })

      const result = await response.json()
      setAnalysis(result)
    } catch (error) {
      console.error('Analysis failed:', error)
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
        <p className="text-foreground/60">Get real-time AI-powered analysis of your code</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="csharp">C#</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Code</label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here..."
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
                  <span className="animate-spin mr-2">⏳</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Analyze Code
                </>
              )}
            </Button>
            {analysis && (
              <Button variant="outline" onClick={clearAnalysis}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {!analysis ? (
            <div className="h-full flex items-center justify-center rounded-lg bg-card border border-border">
              <div className="text-center">
                <Code2 className="w-12 h-12 text-foreground/40 mx-auto mb-3" />
                <p className="text-foreground/60">Paste code and click analyze to see results</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quality Score */}
              <div className="p-6 rounded-lg bg-card border border-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-foreground">Quality Score</h3>
                  <span className="text-3xl font-bold text-primary">{analysis.quality}/100</span>
                </div>
                <div className="w-full bg-border rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${analysis.quality}%` }}
                  />
                </div>
              </div>

              {/* Analysis Time */}
              <div className="text-xs text-foreground/50">
                Analysis completed in {analysis.timeMs}ms
              </div>

              {/* Issues */}
              {analysis.issues.length > 0 && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                  <h4 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Issues Found ({analysis.issues.length})
                  </h4>
                  <ul className="space-y-1">
                    {analysis.issues.map((issue, i) => (
                      <li key={i} className="text-sm text-red-300">• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Best Practices */}
              {analysis.bestPractices.length > 0 && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <h4 className="font-semibold text-green-400 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Best Practices ({analysis.bestPractices.length})
                  </h4>
                  <ul className="space-y-1">
                    {analysis.bestPractices.map((practice, i) => (
                      <li key={i} className="text-sm text-green-300">• {practice}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <h4 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Suggestions ({analysis.suggestions.length})
                  </h4>
                  <ul className="space-y-1">
                    {analysis.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm text-blue-300">• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card border border-border">
          <h4 className="font-semibold text-foreground mb-2">Performance</h4>
          <p className="text-sm text-foreground/60">Time complexity and efficiency analysis</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <h4 className="font-semibold text-foreground mb-2">Security</h4>
          <p className="text-sm text-foreground/60">Identify potential vulnerabilities</p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <h4 className="font-semibold text-foreground mb-2">Readability</h4>
          <p className="text-sm text-foreground/60">Suggestions for cleaner code</p>
        </div>
      </div>
    </div>
  )
}
