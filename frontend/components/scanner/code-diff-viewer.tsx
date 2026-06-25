'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface CodeDiffViewerProps {
  originalCode: string
  suggestedCode: string
  language?: string
  onApply?: () => void
  confidence?: number
  title?: string
  description?: string
}

export function CodeDiffViewer({
  originalCode,
  suggestedCode,
  language = 'typescript',
  onApply,
  confidence = 0.85,
  title = 'Suggested Fix',
  description,
}: CodeDiffViewerProps) {
  const [showDiff, setShowDiff] = useState(true)
  const [copiedOriginal, setCopiedOriginal] = useState(false)
  const [copiedSuggested, setSuggestedCopied] = useState(false)

  const copyCode = (code: string, setSetter: (val: boolean) => void) => {
    navigator.clipboard.writeText(code)
    setSetter(true)
    setTimeout(() => setSetter(false), 2000)
  }

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.9) return 'bg-green-500/20 text-green-600 border-green-500/30'
    if (conf >= 0.7) return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30'
    return 'bg-orange-500/20 text-orange-600 border-orange-500/30'
  }

  const highlightDifferences = (code: string) => {
    // Simple line-by-line comparison
    return code
  }

  return (
    <Card className="bg-card/30 border border-border p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-foreground/60">{description}</p>}
        </div>
        <div className={`px-3 py-1 rounded border text-sm font-medium ${getConfidenceColor(confidence)}`}>
          {Math.round(confidence * 100)}% confident
        </div>
      </div>

      {/* Toggle Diff View */}
      <button
        onClick={() => setShowDiff(!showDiff)}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition"
      >
        {showDiff ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {showDiff ? 'Hide' : 'Show'} side-by-side comparison
      </button>

      {/* Code Comparison */}
      {showDiff ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Original Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground/60 uppercase">Original</p>
              <button
                onClick={() => copyCode(originalCode, setCopiedOriginal)}
                className="p-1 hover:bg-background rounded text-foreground/60 hover:text-foreground transition"
              >
                {copiedOriginal ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="bg-red-500/5 border border-red-500/20 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-foreground/80 whitespace-pre-wrap break-words">
                {originalCode}
              </pre>
            </div>
          </div>

          {/* Suggested Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground/60 uppercase">Suggested</p>
              <button
                onClick={() => copyCode(suggestedCode, setSuggestedCopied)}
                className="p-1 hover:bg-background rounded text-foreground/60 hover:text-foreground transition"
              >
                {copiedSuggested ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-foreground/80 whitespace-pre-wrap break-words">
                {suggestedCode}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        /* Unified Code View */
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground/60 uppercase">Updated Code</p>
          <div className="bg-card border border-border rounded p-3 font-mono text-xs overflow-x-auto">
            <pre className="text-foreground/80 whitespace-pre-wrap break-words">
              {suggestedCode}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-border">
        <Button onClick={onApply} className="flex-1" size="sm">
          Apply This Fix
        </Button>
        <Button variant="outline" size="sm">
          Preview Impact
        </Button>
      </div>
    </Card>
  )
}
