'use client'

import { useState, useCallback } from 'react'
import { CodeEditor } from './code-editor'
import { DiagnosticPanel, Diagnostic } from './diagnostic-panel'
import { QuickFixMenu, QuickFix } from './quick-fix-menu'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react'

interface RealtimeAnalyzerProps {
  initialCode?: string
  language?: string
  onCodeChange?: (code: string) => void
}

export function RealtimeAnalyzer({
  initialCode = '',
  language = 'typescript',
  onCodeChange,
}: RealtimeAnalyzerProps) {
  const [code, setCode] = useState(initialCode)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [fixes, setFixes] = useState<QuickFix[]>([])
  const [qualityScore, setQualityScore] = useState(0)
  const [analysisMetadata, setAnalysisMetadata] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('diagnostics')

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode)
    onCodeChange?.(newCode)
  }, [onCodeChange])

  const handleAnalysisComplete = useCallback(async (result: any) => {
    if (!result || !result.issues) return

    // Convert analysis issues to diagnostics
    const newDiagnostics: Diagnostic[] = result.issues.map((issue: any, idx: number) => ({
      id: `diag_${idx}`,
      line: issue.line || 1,
      column: issue.column || 1,
      message: issue.message || 'Unknown issue',
      severity: issue.severity || 'warning',
      code: issue.rule || issue.type,
      rule: issue.rule,
    }))

    setDiagnostics(newDiagnostics)
    setQualityScore(result.quality || 0)
    setAnalysisMetadata(result)

    // Generate quick fixes from suggestions if available
    if (result.suggestions && Array.isArray(result.suggestions)) {
      const quickFixes: QuickFix[] = result.suggestions.slice(0, 3).map((sugg: any, idx: number) => ({
        id: `fix_${idx}`,
        title: sugg.title || 'Code Improvement',
        description: sugg.description || '',
        code: sugg.code || '// Suggested fix',
        explanation: sugg.explanation || 'This suggestion will improve your code',
        confidence: sugg.confidence || 0.75,
      }))
      setFixes(quickFixes)
    }
  }, [])

  const handleApplyFix = useCallback(async (fixId: string) => {
    // In a real implementation, this would apply the fix to the editor
    console.log('[v0] Applying fix:', fixId)
    // Simulate fix application
    return new Promise(resolve => setTimeout(resolve, 500))
  }, [])

  const handleDismissFix = useCallback((fixId: string) => {
    setFixes(prev => prev.filter(f => f.id !== fixId))
  }, [])

  const getQualityColor = () => {
    if (qualityScore >= 80) return 'text-green-500'
    if (qualityScore >= 60) return 'text-yellow-500'
    if (qualityScore >= 40) return 'text-orange-500'
    return 'text-red-500'
  }

  const getQualityLabel = () => {
    if (qualityScore >= 80) return 'Excellent'
    if (qualityScore >= 60) return 'Good'
    if (qualityScore >= 40) return 'Fair'
    return 'Poor'
  }

  return (
    <div className="space-y-4">
      {/* Quality Score Banner */}
      {analysisMetadata && (
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Code Quality Score</p>
              <div className="flex items-center gap-3">
                <div className={`text-4xl font-bold ${getQualityColor()}`}>
                  {Math.round(qualityScore)}
                </div>
                <p className="text-sm font-medium text-foreground">{getQualityLabel()}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-red-500">
                  {analysisMetadata.bugs || 0}
                </div>
                <p className="text-xs text-muted-foreground">Bugs</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500">
                  {analysisMetadata.vulnerabilities || 0}
                </div>
                <p className="text-xs text-muted-foreground">Issues</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">
                  {analysisMetadata.codeSmells || 0}
                </div>
                <p className="text-xs text-muted-foreground">Smells</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Editor and Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Code Editor - Takes 2 columns on large screens */}
        <div className="lg:col-span-2 space-y-2">
          <p className="text-sm font-semibold text-foreground">Code Editor</p>
          <CodeEditor
            value={code}
            onChange={handleCodeChange}
            language={language}
            height={500}
            liveAnalysis={true}
            onAnalysisComplete={handleAnalysisComplete}
            diagnostics={diagnostics}
          />
        </div>

        {/* Right Sidebar - Diagnostics and Quick Fixes */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="diagnostics" className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Issues</span>
                {diagnostics.length > 0 && (
                  <span className="ml-1 text-xs font-semibold bg-red-500/20 px-2 py-0.5 rounded">
                    {diagnostics.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="fixes" className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Fixes</span>
                {fixes.length > 0 && (
                  <span className="ml-1 text-xs font-semibold bg-blue-500/20 px-2 py-0.5 rounded">
                    {fixes.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diagnostics" className="mt-4">
              {diagnostics.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No issues detected!</p>
                </div>
              ) : (
                <DiagnosticPanel
                  diagnostics={diagnostics}
                  height={400}
                />
              )}
            </TabsContent>

            <TabsContent value="fixes" className="mt-4">
              {fixes.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No suggestions available</p>
                </div>
              ) : (
                <QuickFixMenu
                  fixes={fixes}
                  onApplyFix={handleApplyFix}
                  onDismissFix={handleDismissFix}
                  isOpen={true}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Bottom Info Panel */}
      {analysisMetadata && (
        <Card className="p-3 bg-secondary/30 border-border text-xs text-muted-foreground">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="font-semibold text-foreground">Complexity</p>
              <p>{analysisMetadata.complexityScore?.toFixed(1) || 'N/A'}</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Maintainability</p>
              <p>{analysisMetadata.maintainabilityIndex?.toFixed(0) || 'N/A'}</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Test Coverage</p>
              <p>{analysisMetadata.testCoveragePercentage?.toFixed(0) || 0}%</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Analysis Time</p>
              <p>{analysisMetadata.timeMs?.toFixed(0) || 0}ms</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
